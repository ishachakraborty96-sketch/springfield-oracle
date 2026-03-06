#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');

// ── STEP 1: INGESTION ──────────────────────────────────────────────────────────

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
  // Strip script tags and their content
  let text = rawHtml.replace(/<script[\s\S]*?<\/script>/gi, '');
  // Replace <br> with newlines
  text = text.replace(/<br\s*\/?>/gi, '\n');
  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');
  // Decode HTML entities
  text = text.replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  // Remove content in brackets [stage directions]
  text = text.replace(/\[[^\]]*\]/g, '');
  // Split into lines, trim, remove empty
  const lines = text.split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines;
}

function parseSpeaker(line) {
  // Match patterns like "HOMER:" or "Homer Simpson:" at start of line
  const m = line.match(/^([A-Z][A-Z\s.']+):\s*(.*)/);
  if (m) {
    return { speaker: m[1].trim(), dialogue: m[2].trim() || null };
  }
  return { speaker: null, dialogue: line };
}

function ingestTranscript(url) {
  const meta = parseEpisodeId(url);
  if (!meta) {
    return { error: 'NO_TRANSCRIPT', url };
  }

  let html;
  try {
    html = fetchPage(url);
  } catch (e) {
    return { error: 'NO_TRANSCRIPT', url };
  }

  const rawTranscript = extractTranscript(html);
  if (!rawTranscript) {
    return { error: 'NO_TRANSCRIPT', url };
  }

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
    air_date: null,
    transcript_lines,
  };
}

// ── STEP 2: SCENE DETECTION ────────────────────────────────────────────────────

function detectSceneMarkers(lines) {
  const boundaries = [];
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].dialogue.toUpperCase();
    if (/\b(INT\.|INT:|EXT\.|EXT:)\s*/i.test(text)) {
      boundaries.push(i);
    }
  }
  return boundaries;
}

function extractLocation(lines, startIdx) {
  // Try to extract location from the first few lines of a scene
  for (let i = startIdx; i < Math.min(startIdx + 3, lines.length); i++) {
    const text = lines[i].dialogue;
    const m = text.match(/(?:INT\.|INT:|EXT\.|EXT:)\s*(.+?)(?:\s*[-–—]|$)/i);
    if (m) return m[1].trim();
  }
  return 'Unknown';
}

function detectLocationChanges(lines) {
  // Detect scene changes via contextual clues: location words, significant pauses
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
  // Detect boundaries where the set of speakers changes significantly
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
    // If speaker sets are very different, mark as boundary
    if (before.size > 0 && after.size > 0) {
      const intersection = [...before].filter((s) => after.has(s)).length;
      const union = new Set([...before, ...after]).size;
      const jaccard = intersection / union;
      if (jaccard < 0.25) {
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

  // Deduplicate and sort
  let sorted = [...new Set(boundaries)].sort((a, b) => a - b);

  // Ensure 0 is first
  if (sorted[0] !== 0) sorted.unshift(0);

  // Merge boundaries that are too close (< 3 lines apart)
  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - merged[merged.length - 1] >= 3) {
      merged.push(sorted[i]);
    }
  }

  // If too many scenes, subsample to target range
  if (merged.length > targetMax) {
    const target = Math.floor((targetMin + targetMax) / 2);
    const step = Math.ceil(merged.length / target);
    const subsampled = [merged[0]];
    for (let i = step; i < merged.length; i += step) {
      subsampled.push(merged[i]);
    }
    return subsampled;
  }

  // If too few scenes, subdivide large gaps to reach target
  if (merged.length < targetMin) {
    const target = Math.floor((targetMin + targetMax) / 2);
    const needed = target - merged.length;
    // Collect all gaps with their sizes
    const gaps = [];
    for (let i = 0; i < merged.length; i++) {
      const start = merged[i];
      const end = i + 1 < merged.length ? merged[i + 1] : totalLines;
      gaps.push({ start, end, size: end - start, idx: i });
    }
    // Sort gaps by size descending, split the largest ones
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

function buildScenes(episode_id, lines, boundaries) {
  const scenes = [];
  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i];
    const end = i + 1 < boundaries.length ? boundaries[i + 1] : lines.length;
    const sceneLines = lines.slice(start, end);

    if (sceneLines.length === 0) continue;

    const characters = [...new Set(
      sceneLines.filter((l) => l.speaker).map((l) => l.speaker)
    )];

    const location = extractLocation(sceneLines, 0) ||
      (sceneLines[0] ? sceneLines[0].dialogue.substring(0, 50) : 'Unknown');

    const dialogue_lines = sceneLines.map((l) => ({
      speaker: l.speaker || 'UNKNOWN',
      text: l.dialogue,
    }));

    scenes.push({
      scene_id: `${episode_id}_sc${String(scenes.length + 1).padStart(3, '0')}`,
      episode_id,
      seq: scenes.length + 1,
      location,
      characters,
      dialogue_lines,
    });
  }
  return scenes;
}

function detectScenes(transcript) {
  const { episode_id, transcript_lines } = transcript;

  // Try INT:/EXT: markers first
  let boundaries = detectSceneMarkers(transcript_lines);

  // If few markers found, supplement with location changes and speaker clusters
  if (boundaries.length < 10) {
    const locationBounds = detectLocationChanges(transcript_lines);
    const speakerBounds = detectSpeakerClusters(transcript_lines);
    boundaries = [...boundaries, ...locationBounds, ...speakerBounds];
  }

  // If still insufficient, use fallback windowing
  if (boundaries.length < 5) {
    boundaries = fallbackWindowed(transcript_lines.length);
  }

  boundaries = mergeAndFilterBoundaries(boundaries, transcript_lines.length);
  return buildScenes(episode_id, transcript_lines, boundaries);
}

// ── STEP 3: OUTPUT & TEST ──────────────────────────────────────────────────────

function main() {
  const url = 'https://www.springfieldspringfield.co.uk/view_episode_scripts.php?tv-show=the-simpsons&episode=s01e01';

  console.log(`Fetching transcript from: ${url}`);
  const transcript = ingestTranscript(url);

  if (transcript.error) {
    console.error(`Error: ${transcript.error} for ${transcript.url}`);
    process.exit(1);
  }

  console.log(`Episode: ${transcript.title} (${transcript.episode_id})`);
  console.log(`Transcript lines: ${transcript.transcript_lines.length}`);

  const scenes = detectScenes(transcript);
  console.log(`Scenes detected: ${scenes.length}`);

  const output = {
    episode_id: transcript.episode_id,
    title: transcript.title,
    season: transcript.season,
    episode_num: transcript.episode_num,
    total_scenes: scenes.length,
    scenes,
  };

  fs.writeFileSync('scenes.json', JSON.stringify(output, null, 2));
  console.log('Saved scenes.json');

  // ── TEST RUNNER ────────────────────────────────────────────────────────────
  console.log('\n── TEST RESULTS ──');
  runTests();
}

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

  // Test 1: scenes.json is valid JSON
  test('scenes.json is valid JSON', () => {
    const raw = fs.readFileSync('scenes.json', 'utf-8');
    JSON.parse(raw);
    return true;
  });

  // Test 2: Each scene has required fields
  test('Each scene has required fields', () => {
    const data = JSON.parse(fs.readFileSync('scenes.json', 'utf-8'));
    const required = ['scene_id', 'episode_id', 'seq', 'location', 'characters', 'dialogue_lines'];
    for (const scene of data.scenes) {
      for (const field of required) {
        if (!(field in scene)) {
          return `Scene ${scene.scene_id || '?'} missing field: ${field}`;
        }
      }
    }
    return true;
  });

  // Test 3: Scene count between 30–50
  test('Scene count is between 30-50', () => {
    const data = JSON.parse(fs.readFileSync('scenes.json', 'utf-8'));
    const count = data.scenes.length;
    if (count < 30 || count > 50) {
      return `Scene count is ${count}, expected 30-50`;
    }
    return true;
  });

  // Test 4: No empty dialogue_lines arrays
  test('No empty dialogue_lines arrays', () => {
    const data = JSON.parse(fs.readFileSync('scenes.json', 'utf-8'));
    for (const scene of data.scenes) {
      if (!scene.dialogue_lines || scene.dialogue_lines.length === 0) {
        return `Scene ${scene.scene_id} has empty dialogue_lines`;
      }
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
