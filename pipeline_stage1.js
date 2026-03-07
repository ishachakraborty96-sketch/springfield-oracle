#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');

// ── SEASON RANGES ────────────────────────────────────────────────────────────

const SEASON_RANGES = [
  { lo: 6, hi: 15 },
  { lo: 23, hi: 27 },
];

function inSeasonRange(season) {
  return SEASON_RANGES.some((r) => season >= r.lo && season <= r.hi);
}

// ── STEP 1: INGESTION ────────────────────────────────────────────────────────

function fetchPage(url) {
  const result = execSync(
    `curl -sL --max-time 30 -H "User-Agent: Mozilla/5.0" "${url}"`,
    { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
  );
  if (!result || result.length === 0) {
    throw new Error('Empty response from curl');
  }
  return result;
}

function parseEpisodeId(url) {
  const m = url.match(/episode=(s(\d+)e(\d+))/i);
  if (!m) return null;
  return {
    episode_id: m[1].toLowerCase(),
    season: parseInt(m[2], 10),
    episode_num: parseInt(m[3], 10),
  };
}

function extractTranscript(html) {
  const m = html.match(/<div class="scrolling-script-container">([\s\S]*?)<\/div>/);
  if (!m) return null;
  return m[1];
}

function extractTitle(html) {
  const m = html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : 'Unknown';
}

function cleanTranscriptLines(rawHtml) {
  let text = rawHtml.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  text = text.replace(/\[[^\]]*\]/g, '');
  const lines = text.split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines;
}

function parseSpeaker(line) {
  const m = line.match(/^([A-Z][A-Z\s.']+):\s*(.*)/);
  if (m) {
    return { speaker: m[1].trim(), dialogue: m[2].trim() || null };
  }
  return { speaker: null, dialogue: line };
}

function ingestTranscript(url) {
  const meta = parseEpisodeId(url);
  if (!meta) return { error: 'NO_TRANSCRIPT', url };

  let html;
  try {
    html = fetchPage(url);
  } catch (e) {
    return { error: 'NO_TRANSCRIPT', url };
  }

  const rawTranscript = extractTranscript(html);
  if (!rawTranscript) return { error: 'NO_TRANSCRIPT', url };

  const title = extractTitle(html);
  const lines = cleanTranscriptLines(rawTranscript);

  const transcript_lines = lines.map((line, i) => {
    const { speaker, dialogue } = parseSpeaker(line);
    return { line_num: i + 1, speaker, dialogue: dialogue || line };
  });

  return {
    episode_id: meta.episode_id,
    season: meta.season,
    episode_num: meta.episode_num,
    title,
    transcript_lines,
  };
}

// ── STEP 2: SCENE DETECTION ─────────────────────────────────────────────────

function detectSceneMarkers(lines) {
  const boundaries = [];
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].dialogue.toUpperCase();
    if (/\b(INT\.|INT:|EXT\.|EXT:|SCENE)\b/i.test(text)) {
      boundaries.push(i);
    }
  }
  return boundaries;
}

function extractLocation(lines, startIdx) {
  for (let i = startIdx; i < Math.min(startIdx + 3, lines.length); i++) {
    const text = lines[i].dialogue;
    const m = text.match(/(?:INT\.|INT:|EXT\.|EXT:)\s*(.+?)(?:\s*[-–—]|$)/i);
    if (m) return m[1].trim();
  }
  return 'Unknown';
}

function detectLocationChanges(lines) {
  const locationKeywords = [
    'at the', 'in the', 'at home', 'at school', 'at work',
    'meanwhile', 'later', 'inside', 'outside', 'back at',
    'cut to', 'scene:', 'location:',
  ];
  const boundaries = [];
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].dialogue.toLowerCase();
    for (const kw of locationKeywords) {
      if (lower.startsWith(kw) || lower.includes('meanwhile') || lower.includes('cut to')) {
        boundaries.push(i);
        break;
      }
    }
  }
  return boundaries;
}

function detectSpeakerClusters(lines) {
  const boundaries = [];
  const windowSize = 10;
  for (let i = windowSize; i < lines.length - windowSize; i++) {
    const before = new Set();
    const after = new Set();
    for (let j = i - windowSize; j < i; j++) {
      if (lines[j].speaker) before.add(lines[j].speaker);
    }
    for (let j = i; j < Math.min(i + windowSize, lines.length); j++) {
      if (lines[j].speaker) after.add(lines[j].speaker);
    }
    if (before.size > 0 && after.size > 0) {
      const intersection = [...before].filter((s) => after.has(s)).length;
      const union = new Set([...before, ...after]).size;
      if (intersection / union < 0.25) {
        boundaries.push(i);
      }
    }
  }
  return boundaries;
}

function fallbackWindowed(totalLines, windowSize = 30, overlap = 5) {
  const boundaries = [0];
  const step = windowSize - overlap;
  for (let i = step; i < totalLines; i += step) {
    boundaries.push(i);
  }
  return boundaries;
}

function mergeAndFilterBoundaries(boundaries, totalLines, targetMin = 35, targetMax = 45) {
  if (boundaries.length === 0) return fallbackWindowed(totalLines);

  let sorted = [...new Set(boundaries)].sort((a, b) => a - b);
  if (sorted[0] !== 0) sorted.unshift(0);

  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - merged[merged.length - 1] >= 3) {
      merged.push(sorted[i]);
    }
  }

  if (merged.length > targetMax) {
    const target = Math.floor((targetMin + targetMax) / 2);
    const step = Math.ceil(merged.length / target);
    const subsampled = [merged[0]];
    for (let i = step; i < merged.length; i += step) {
      subsampled.push(merged[i]);
    }
    return subsampled;
  }

  if (merged.length < targetMin) {
    const target = Math.floor((targetMin + targetMax) / 2);
    const needed = target - merged.length;
    const gaps = [];
    for (let i = 0; i < merged.length; i++) {
      const start = merged[i];
      const end = i + 1 < merged.length ? merged[i + 1] : totalLines;
      gaps.push({ start, end, size: end - start, idx: i });
    }
    gaps.sort((a, b) => b.size - a.size);
    const newBounds = [...merged];
    let added = 0;
    for (const gap of gaps) {
      if (added >= needed) break;
      const idealSize = Math.floor(totalLines / target);
      const splits = Math.min(
        Math.floor(gap.size / Math.max(idealSize, 3)) - 1,
        needed - added
      );
      if (splits > 0) {
        const step = Math.floor(gap.size / (splits + 1));
        for (let j = 1; j <= splits; j++) {
          newBounds.push(gap.start + j * step);
          added++;
        }
      }
    }
    return [...new Set(newBounds)].sort((a, b) => a - b);
  }

  return merged;
}

function formatEpisodeId(season, episode_num) {
  return `S${String(season).padStart(2, '0')}E${String(episode_num).padStart(2, '0')}`;
}

function buildScenes(episodeMeta, lines, boundaries) {
  const { episode_id, season, episode_num, title } = episodeMeta;
  const scenes = [];

  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i];
    const end = i + 1 < boundaries.length ? boundaries[i + 1] : lines.length;
    const sceneLines = lines.slice(start, end);
    if (sceneLines.length === 0) continue;

    // Build dialogue lines
    const dialogue_lines = sceneLines.map((l) => ({
      speaker: l.speaker || 'UNKNOWN',
      text: l.dialogue,
    }));

    // Enforce min 2 dialogue lines — discard shorter fragments
    if (dialogue_lines.length < 2) continue;

    // Build raw_text for the scene
    const raw_text = sceneLines.map((l) => {
      return l.speaker ? `${l.speaker}: ${l.dialogue}` : l.dialogue;
    }).join('\n');

    const location = extractLocation(sceneLines, 0) ||
      (sceneLines[0] ? sceneLines[0].dialogue.substring(0, 50) : 'Unknown');

    const characters = [...new Set(
      sceneLines.filter((l) => l.speaker).map((l) => l.speaker)
    )];

    // Enforce max 20 dialogue lines — split longer scenes at natural breaks
    if (dialogue_lines.length > 20) {
      for (let chunk = 0; chunk < dialogue_lines.length; chunk += 20) {
        const chunkLines = dialogue_lines.slice(chunk, chunk + 20);
        if (chunkLines.length < 2) continue;
        const chunkRaw = chunkLines.map((l) => `${l.speaker}: ${l.text}`).join('\n');
        const chunkChars = [...new Set(chunkLines.filter((l) => l.speaker !== 'UNKNOWN').map((l) => l.speaker))];
        const sceneIndex = scenes.length + 1;
        const fmtId = formatEpisodeId(season, episode_num);
        scenes.push({
          scene_id: `${episode_id}_scene_${sceneIndex}`,
          episode_id: fmtId,
          season,
          episode_num,
          episode_title: title,
          scene_index: sceneIndex,
          dialogue_lines: chunkLines,
          raw_text: chunkRaw,
          location,
          characters: chunkChars,
        });
      }
    } else {
      const sceneIndex = scenes.length + 1;
      const fmtId = formatEpisodeId(season, episode_num);
      scenes.push({
        scene_id: `${episode_id}_scene_${sceneIndex}`,
        episode_id: fmtId,
        season,
        episode_num,
        episode_title: title,
        scene_index: sceneIndex,
        dialogue_lines,
        raw_text,
        location,
        characters,
      });
    }
  }

  return scenes;
}

function detectScenes(transcript) {
  const { transcript_lines } = transcript;

  let boundaries = detectSceneMarkers(transcript_lines);

  if (boundaries.length < 10) {
    const locationBounds = detectLocationChanges(transcript_lines);
    const speakerBounds = detectSpeakerClusters(transcript_lines);
    boundaries = [...boundaries, ...locationBounds, ...speakerBounds];
  }

  if (boundaries.length < 5) {
    boundaries = fallbackWindowed(transcript_lines.length);
  }

  boundaries = mergeAndFilterBoundaries(boundaries, transcript_lines.length);
  return buildScenes(transcript, transcript_lines, boundaries);
}

// ── EPISODE DISCOVERY ────────────────────────────────────────────────────────

const BASE_URL = 'https://www.springfieldspringfield.co.uk';
const LISTING_URL = `${BASE_URL}/episode_scripts.php?tv-show=the-simpsons`;

function discoverEpisodes() {
  console.log('Discovering episode URLs from listing page...');
  const html = fetchPage(LISTING_URL);
  const matches = [...html.matchAll(/episode=(s(\d+)e(\d+))/gi)];
  const seen = new Set();
  const episodes = [];
  for (const m of matches) {
    const id = m[1].toLowerCase();
    const season = parseInt(m[2], 10);
    const episode_num = parseInt(m[3], 10);
    if (seen.has(id)) continue;
    if (!inSeasonRange(season)) continue;
    seen.add(id);
    episodes.push({
      episode_id: id,
      season,
      episode_num,
      url: `${BASE_URL}/view_episode_scripts.php?tv-show=the-simpsons&episode=${id}`,
    });
  }
  episodes.sort((a, b) => a.season - b.season || a.episode_num - b.episode_num);
  return episodes;
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

function main() {
  let allEpisodes = discoverEpisodes();
  const totalDiscovered = allEpisodes.length;
  console.log(`Discovered ${totalDiscovered} episodes in target season ranges (6-15, 23-27)`);

  // Load existing scenes.json for incremental processing
  let existing = [];
  const existingIds = new Set();
  if (fs.existsSync('scenes.json')) {
    try {
      const prev = JSON.parse(fs.readFileSync('scenes.json', 'utf-8'));
      existing = Array.isArray(prev) ? prev : (prev.episodes || prev);
      for (const ep of existing) existingIds.add(ep.episode_id);
      console.log(`Loaded ${existing.length} previously processed episodes from scenes.json`);
    } catch (e) {
      console.warn('Could not load existing scenes.json, starting fresh');
    }
  }

  const toProcess = allEpisodes.filter((e) => !existingIds.has(e.episode_id));
  const skipped = totalDiscovered - toProcess.length - existingIds.size;
  console.log(`Total files found: ${totalDiscovered}`);
  console.log(`Total skipped (already processed): ${existingIds.size}`);
  console.log(`Episodes to process: ${toProcess.length}\n`);

  const errors = [];
  let totalNewScenes = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const ep = toProcess[i];
    const progress = `[${i + 1}/${toProcess.length}]`;
    process.stdout.write(`${progress} ${ep.episode_id}...`);

    const transcript = ingestTranscript(ep.url);
    if (transcript.error) {
      console.log(` ERROR: ${transcript.error}`);
      errors.push({ episode_id: ep.episode_id, url: ep.url, error: transcript.error });
      continue;
    }

    const scenes = detectScenes(transcript);
    totalNewScenes += scenes.length;

    existing.push({
      episode_id: transcript.episode_id,
      title: transcript.title,
      season: transcript.season,
      episode_num: transcript.episode_num,
      total_scenes: scenes.length,
      scenes,
    });

    console.log(` "${transcript.title}" — ${transcript.transcript_lines.length} lines, ${scenes.length} scenes`);

    // Save incrementally every 10 episodes
    if ((i + 1) % 10 === 0) {
      saveOutput(existing, errors);
      console.log(`  (incremental save at ${existing.length} episodes)`);
    }
  }

  saveOutput(existing, errors);

  const totalEps = existing.length;
  const totalScenes = existing.reduce((sum, ep) => sum + (ep.total_scenes || ep.scenes.length), 0);
  const avgScenes = totalEps > 0 ? (totalScenes / totalEps).toFixed(1) : 0;

  console.log(`\n── SUMMARY ──`);
  console.log(`Total episodes processed: ${totalEps}`);
  console.log(`Total scenes extracted: ${totalScenes}`);
  console.log(`Average scenes per episode: ${avgScenes}`);
  if (errors.length > 0) {
    console.log(`Errors: ${errors.length}`);
    for (const err of errors) console.log(`  ${err.episode_id}: ${err.error}`);
  }

  console.log('\n── TEST RESULTS ──');
  runTests();
}

function saveOutput(episodes, errors) {
  // Sort by season ASC, episode ASC
  episodes.sort((a, b) => a.season - b.season || a.episode_num - b.episode_num);
  // Flatten all scenes sorted by season, episode, scene_index
  const allScenes = [];
  for (const ep of episodes) {
    for (const scene of ep.scenes) {
      allScenes.push(scene);
    }
  }
  allScenes.sort((a, b) => a.season - b.season || a.episode_num - b.episode_num || a.scene_index - b.scene_index);

  const output = {
    total_episodes: episodes.length,
    total_scenes: allScenes.length,
    season_ranges: '6-15, 23-27',
    errors: errors.length > 0 ? errors : undefined,
    episodes,
  };
  fs.writeFileSync('scenes.json', JSON.stringify(output, null, 2));
}

// ── TEST RUNNER ──────────────────────────────────────────────────────────────

function runTests() {
  let allPassed = true;

  function test(name, fn) {
    try {
      const result = fn();
      if (result === true) {
        console.log(`PASS: ${name}`);
      } else {
        console.log(`FAIL: ${name} — ${result}`);
        allPassed = false;
      }
    } catch (e) {
      console.log(`FAIL: ${name} — ${e.message}`);
      allPassed = false;
    }
  }

  const data = JSON.parse(fs.readFileSync('scenes.json', 'utf-8'));

  // Test 1: scenes.json is valid JSON
  test('scenes.json is valid JSON', () => {
    if (!data.episodes || !Array.isArray(data.episodes)) return 'Expected { episodes: [] } structure';
    return true;
  });

  // Test 2: Only seasons 6-15 and 23-27 present in output
  test('Only seasons 6-15 and 23-27 present in output', () => {
    for (const ep of data.episodes) {
      if (!inSeasonRange(ep.season)) {
        return `Found season ${ep.season} (${ep.episode_id}) outside allowed ranges`;
      }
    }
    return true;
  });

  // Test 3: No scene has fewer than 2 dialogue_lines
  test('No scene has fewer than 2 dialogue_lines', () => {
    for (const ep of data.episodes) {
      for (const scene of ep.scenes) {
        if (!scene.dialogue_lines || scene.dialogue_lines.length < 2) {
          return `Scene ${scene.scene_id} has ${scene.dialogue_lines ? scene.dialogue_lines.length : 0} dialogue_lines (min 2)`;
        }
      }
    }
    return true;
  });

  // Test 4: scene_id, episode_id, season, episode_num all populated on every scene
  test('scene_id, episode_id, season, episode_num all populated on every scene', () => {
    const required = ['scene_id', 'episode_id', 'season', 'episode_num'];
    for (const ep of data.episodes) {
      for (const scene of ep.scenes) {
        for (const field of required) {
          if (scene[field] === undefined || scene[field] === null || scene[field] === '') {
            return `Scene ${scene.scene_id || '?'} missing or empty field: ${field}`;
          }
        }
      }
    }
    return true;
  });

  // Test 5: Key episodes present
  test('S06E19, S09E19, S11E17, S23E17, S26E12 all present in output', () => {
    const required = ['s06e19', 's09e19', 's11e17', 's23e17', 's26e12'];
    const present = new Set(data.episodes.map((ep) => ep.episode_id));
    const missing = required.filter((id) => !present.has(id));
    if (missing.length > 0) {
      return `Missing episodes: ${missing.join(', ')}`;
    }
    return true;
  });

  // Test 6: Total scene count between 8,000-18,000
  test('Total scene count is between 8,000-18,000', () => {
    const total = data.episodes.reduce((sum, ep) => sum + ep.scenes.length, 0);
    if (total < 8000 || total > 18000) {
      return `Total scene count is ${total}, expected 8,000-18,000`;
    }
    return true;
  });

  console.log(allPassed ? '\nAll tests PASSED' : '\nSome tests FAILED');
}

try {
  main();
} catch (e) {
  console.error('Pipeline error:', e.message);
  process.exit(1);
}
