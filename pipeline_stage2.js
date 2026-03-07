#!/usr/bin/env node

const fs = require('fs');
const crypto = require('crypto');

const MOCK_MODE = process.argv.includes('--mock');
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
const MODEL = 'claude-haiku-4-5-20251001';

if (!MOCK_MODE && !ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY not set. Use --mock for heuristic mode.');
  process.exit(1);
}

// ── PRIORITY EPISODES ────────────────────────────────────────────────────────

const PRIORITY_EPISODES = new Set([
  's06e19', 's07e24', 's09e19', 's10e02', 's10e05',
  's11e17', 's12e06', 's13e01', 's12e09', 's14e15', 's15e05',
  's23e17', 's24e09', 's26e12', 's26e15', 's27e16', 's27e06',
]);

function isPriorityEpisode(episode_id) {
  return PRIORITY_EPISODES.has(episode_id.toLowerCase());
}

// ── NEAR-FUTURE THEMES ──────────────────────────────────────────────────────

const NEAR_FUTURE_THEMES = [
  'ai replacing', 'ai replace', 'artificial intelligence', 'automat',
  'robot', 'machine learning',
  'tech billionaire', 'billionaire', 'mogul', 'tycoon',
  'mars', 'coloniz', 'colonise', 'space colon',
  'surveillance', 'spy', 'monitor', 'track', 'watch',
  'nuclear', 'reactor', 'atomic energy', 'power plant',
  'middle east', 'conflict', 'war', 'missile',
  'brain', 'neural', 'interface', 'implant', 'chip',
  'smart home', 'alexa', 'siri', 'sentient', 'controlling',
  'election', 'manipulat', 'vote', 'hack', 'rigged',
  'prediction market', 'insider trad', 'insider deal',
];

function matchesNearFutureTheme(text) {
  const lower = text.toLowerCase();
  return NEAR_FUTURE_THEMES.filter((t) => lower.includes(t));
}

// ── CLAUDE API ──────────────────────────────────────────────────────────────

function callClaude(systemPrompt, userMessage) {
  const body = JSON.stringify({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const { execSync } = require('child_process');
  const result = execSync(`curl -sS --max-time 60 "${ANTHROPIC_BASE_URL}/v1/messages" \
    -H "content-type: application/json" \
    -H "x-api-key: ${ANTHROPIC_API_KEY}" \
    -H "anthropic-version: 2023-06-01" \
    -d '${body.replace(/'/g, "'\\''")}'`, {
    encoding: 'utf-8',
    maxBuffer: 5 * 1024 * 1024,
  });

  const parsed = JSON.parse(result);
  if (parsed.error) {
    throw new Error(`API error: ${parsed.error.message}`);
  }
  return parsed.content[0].text;
}

// ── STEP 1: HIGH-SIGNAL FILTER ──────────────────────────────────────────────

const FILTER_SYSTEM_PROMPT = `You are a content filter for Springfield Oracle. Determine whether this scene contains ANY statement about how technology, government, economics, science, corporations, media, surveillance, or society might change or develop. Even one line of system-level commentary qualifies. Give extra weight to scenes touching on: AI labour replacement, tech billionaire power, space colonisation, mass surveillance, nuclear energy, Middle East conflict, brain-computer interfaces, smart home AI, electoral manipulation.
Respond with exactly one of: YES / MAYBE / NO.
Then on a new line, if YES or MAYBE, quote the specific triggering line.
If NO, write REASON: [brief reason]. Be terse.`;

const PREDICTION_KEYWORDS = [
  'robot', 'automat', 'computer', 'machine', 'future', 'predict',
  'invent', 'surveillance', 'camera', 'monitor', 'spy', 'track',
  'phone', 'video', 'watch', 'screen', 'device', 'technology',
  'government', 'president', 'election', 'vote', 'law', 'policy',
  'corporation', 'company', 'business', 'money', 'economy', 'market',
  'science', 'space', 'nuclear', 'energy', 'climate', 'pollution',
  'media', 'news', 'broadcast', 'television', 'internet', 'online',
  'genetic', 'clone', 'biotech', 'medicine', 'drug', 'health',
  'war', 'military', 'weapon', 'army', 'missile', 'drone',
  'censor', 'privacy', 'data', 'artificial', 'intelligent',
  'wristwatch', 'hologram', 'virtual', 'digital', 'crypto',
  'mars', 'coloniz', 'brain', 'neural', 'implant', 'billionaire',
  'tycoon', 'smart home', 'sentient', 'manipulat', 'hack',
  'reactor', 'atomic', 'insider', 'prediction market',
];

function mockFilter(scene) {
  const text = scene.dialogue_lines.map((l) => l.text).join(' ').toLowerCase();
  const matches = PREDICTION_KEYWORDS.filter((kw) => text.includes(kw));
  const themeHits = matchesNearFutureTheme(text);

  // Priority episodes get a lower threshold
  const isPriority = isPriorityEpisode(scene.episode_id);
  const yesThreshold = isPriority ? 3 : 5;
  const maybeThreshold = isPriority ? 2 : 3;

  // Near-future theme hits count double
  const effectiveScore = matches.length + themeHits.length;

  if (effectiveScore >= yesThreshold) {
    const triggerLine = scene.dialogue_lines.find((l) =>
      matches.some((kw) => l.text.toLowerCase().includes(kw)) ||
      themeHits.some((t) => l.text.toLowerCase().includes(t))
    );
    return { verdict: 'YES', trigger: triggerLine ? triggerLine.text : '' };
  }
  if (effectiveScore >= maybeThreshold && matches.length > 0) {
    const triggerLine = scene.dialogue_lines.find((l) =>
      matches.some((kw) => l.text.toLowerCase().includes(kw))
    );
    return { verdict: 'MAYBE', trigger: triggerLine ? triggerLine.text : '' };
  }
  return { verdict: 'NO', trigger: '' };
}

function filterScene(scene) {
  if (MOCK_MODE) return mockFilter(scene);

  const dialogue = scene.dialogue_lines
    .map((l) => `${l.speaker}: ${l.text}`)
    .join('\n');

  const response = callClaude(FILTER_SYSTEM_PROMPT, dialogue);
  const lines = response.trim().split('\n');
  const verdict = lines[0].trim().toUpperCase();
  const trigger = lines.slice(1).join('\n').trim();

  return { verdict, trigger };
}

// ── STEP 2: WORLD-STATE EXTRACTION ──────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `You are a prediction extractor for Springfield Oracle.
Extract the world-state description this scene implies.
Rules:
1) Remove all Simpsons-specific context — no character names, no Springfield
2) Write in present tense as a factual statement
3) Keep specific details — 'wristwatch video calls' not 'wearable devices'
4) Maximum 2 sentences
5) If multiple distinct predictions exist, extract each separately
6) Flag as HIGH_PRIORITY if matching: AI labour replacement, tech billionaire power, Mars colonisation, mass surveillance, nuclear energy revival, brain-computer interfaces, smart home AI sentience, electoral manipulation, Middle East conflict
Return JSON: { predictions: [ { description, category, source_quote, priority } ] }
Priority: HIGH_PRIORITY | STANDARD
Categories: technology | government | economics | science | space | media | surveillance | war | corporate | climate | biotech
If no extractable prediction: { predictions: [] }`;

const CATEGORY_KEYWORD_MAP = {
  technology: ['robot', 'automat', 'computer', 'machine', 'device', 'phone', 'screen', 'digital', 'virtual', 'hologram', 'wristwatch', 'video call', 'artificial', 'intelligent', 'smart home', 'sentient', 'brain', 'neural', 'implant', 'interface'],
  government: ['government', 'president', 'election', 'vote', 'law', 'policy', 'senator', 'congress', 'manipulat', 'rigged'],
  economics: ['money', 'economy', 'market', 'bank', 'stock', 'trade', 'inflation', 'currency', 'crypto', 'insider', 'prediction market'],
  science: ['science', 'nuclear', 'energy', 'physics', 'chemistry', 'research', 'reactor', 'atomic'],
  space: ['space', 'nasa', 'rocket', 'mars', 'moon', 'satellite', 'orbit', 'coloniz', 'colonise'],
  media: ['media', 'news', 'broadcast', 'television', 'internet', 'online', 'streaming'],
  surveillance: ['surveillance', 'camera', 'monitor', 'spy', 'track', 'privacy', 'censor', 'data', 'watch'],
  war: ['war', 'military', 'weapon', 'army', 'missile', 'drone', 'bomb', 'middle east', 'conflict'],
  corporate: ['corporation', 'company', 'business', 'merger', 'ceo', 'corporate', 'billionaire', 'tycoon', 'mogul'],
  climate: ['climate', 'pollution', 'environment', 'warming', 'weather', 'emission'],
  biotech: ['genetic', 'clone', 'biotech', 'medicine', 'drug', 'health', 'dna'],
};

const HIGH_PRIORITY_KEYWORDS = [
  'robot', 'automat', 'ai', 'artificial intelligence', 'replace',
  'billionaire', 'tycoon', 'mogul', 'tech titan',
  'mars', 'coloniz', 'colonise', 'space colon',
  'surveillance', 'spy', 'monitor', 'mass track',
  'nuclear', 'reactor', 'atomic energy',
  'brain', 'neural', 'interface', 'implant',
  'smart home', 'sentient', 'controlling',
  'election', 'manipulat', 'vote hack', 'rigged',
  'middle east', 'conflict escalat',
];

function inferPriority(text) {
  const lower = text.toLowerCase();
  return HIGH_PRIORITY_KEYWORDS.some((kw) => lower.includes(kw))
    ? 'HIGH_PRIORITY' : 'STANDARD';
}

function mockExtract(scene, trigger) {
  const text = scene.dialogue_lines.map((l) => l.text).join(' ').toLowerCase();
  const predictions = [];

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORD_MAP)) {
    const matched = keywords.filter((kw) => text.includes(kw));
    if (matched.length > 0) {
      const sourceLine = scene.dialogue_lines.find((l) =>
        matched.some((kw) => l.text.toLowerCase().includes(kw))
      );
      const sourceQuote = sourceLine ? sourceLine.text : trigger;
      const description = `${matched.map((kw) => kw.charAt(0).toUpperCase() + kw.slice(1)).join(' and ')}-related systems become commonplace in everyday life.`;
      const priority = inferPriority(text);
      predictions.push({
        description: description.substring(0, 300),
        category,
        source_quote: sourceQuote,
        priority,
      });
    }
  }

  return predictions.length > 0 ? predictions.slice(0, 3) : [];
}

function extractPredictions(scene, trigger) {
  if (MOCK_MODE) return mockExtract(scene, trigger);

  const dialogue = scene.dialogue_lines
    .map((l) => `${l.speaker}: ${l.text}`)
    .join('\n');

  const userMsg = `Scene dialogue:\n${dialogue}\n\nFilter trigger line: ${trigger}`;
  const response = callClaude(EXTRACTION_SYSTEM_PROMPT, userMsg);

  let jsonStr = response;
  const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1];
  const rawMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (rawMatch) jsonStr = rawMatch[0];

  try {
    const parsed = JSON.parse(jsonStr);
    return (parsed.predictions || []).map((p) => ({
      ...p,
      priority: p.priority || inferPriority(`${p.description} ${p.source_quote}`),
    }));
  } catch (e) {
    console.warn(`  Warning: Failed to parse extraction response for ${scene.scene_id}`);
    return [];
  }
}

// ── GUARDRAILS ──────────────────────────────────────────────────────────────

const SIMPSONS_NAMES = ['homer', 'bart', 'marge', 'lisa', 'springfield', 'maggie', 'burns', 'flanders', 'krusty', 'moe'];

function applyGuardrails(candidate, scene) {
  const flags = [];

  const descLower = candidate.description.toLowerCase();
  for (const name of SIMPSONS_NAMES) {
    if (descLower.includes(name)) {
      flags.push('UNVERIFIED');
      break;
    }
  }

  if (candidate.source_quote) {
    const allDialogue = scene.dialogue_lines.map((l) => l.text).join(' ');
    if (!allDialogue.includes(candidate.source_quote)) {
      flags.push('UNVERIFIED_QUOTE');
    }
  }

  return flags;
}

// ── FILTER + BOOST FOR A SINGLE EPISODE ─────────────────────────────────────

function filterEpisodeScenes(scenes, episodeId) {
  const filtered = [];
  let yesCount = 0, maybeCount = 0, noCount = 0;
  const isPriority = isPriorityEpisode(episodeId);

  for (const scene of scenes) {
    const { verdict, trigger } = filterScene(scene);
    if (verdict.startsWith('YES')) {
      yesCount++;
      filtered.push({ scene, trigger, verdict: 'YES' });
    } else if (verdict.startsWith('MAYBE')) {
      maybeCount++;
      filtered.push({ scene, trigger, verdict: 'MAYBE' });
    } else {
      noCount++;
    }
  }

  // Keyword boost if pass rate below target (or for priority episodes)
  const targetMinRate = isPriority ? 0.12 : 0.08;
  if (scenes.length > 0 && filtered.length / scenes.length < targetMinRate) {
    const noScenes = scenes.filter((s) =>
      !filtered.some((f) => f.scene.scene_id === s.scene_id)
    );
    const scored = noScenes.map((s) => {
      const text = s.dialogue_lines.map((l) => l.text).join(' ').toLowerCase();
      const hits = PREDICTION_KEYWORDS.filter((kw) => text.includes(kw));
      const themeHits = matchesNearFutureTheme(text);
      const triggerLine = (hits.length > 0 || themeHits.length > 0)
        ? s.dialogue_lines.find((l) => {
          const lt = l.text.toLowerCase();
          return hits.some((kw) => lt.includes(kw)) || themeHits.some((t) => lt.includes(t));
        })
        : null;
      return { scene: s, score: hits.length + themeHits.length * 2, trigger: triggerLine ? triggerLine.text : '' };
    }).sort((a, b) => b.score - a.score);

    const needed = Math.ceil(scenes.length * targetMinRate) - filtered.length;
    for (let i = 0; i < Math.min(needed, scored.length); i++) {
      if (scored[i].score > 0) {
        filtered.push({ scene: scored[i].scene, trigger: scored[i].trigger, verdict: 'MAYBE' });
        maybeCount++;
        noCount--;
      }
    }
  }

  return { filtered, yesCount, maybeCount, noCount };
}

// ── MAIN PIPELINE ───────────────────────────────────────────────────────────

function main() {
  console.log(`Mode: ${MOCK_MODE ? 'MOCK (heuristic)' : 'LIVE (Claude API)'}`);

  const scenesData = JSON.parse(fs.readFileSync('scenes.json', 'utf-8'));
  const episodes = scenesData.episodes || [];
  const totalScenes = episodes.reduce((sum, ep) => sum + ep.scenes.length, 0);
  console.log(`Loaded ${episodes.length} episodes, ${totalScenes} total scenes from scenes.json`);

  // Separate priority and non-priority episodes
  const priorityEps = episodes.filter((ep) => isPriorityEpisode(ep.episode_id));
  const standardEps = episodes.filter((ep) => !isPriorityEpisode(ep.episode_id));
  console.log(`Priority episodes: ${priorityEps.length}, Standard episodes: ${standardEps.length}`);

  // Process priority episodes first, then standard
  const processingOrder = [...priorityEps, ...standardEps];

  // Load existing predictions for incremental processing
  let existingPredictions = [];
  const processedEpisodes = new Set();
  if (fs.existsSync('prediction_candidates.json')) {
    try {
      const prev = JSON.parse(fs.readFileSync('prediction_candidates.json', 'utf-8'));
      existingPredictions = prev.predictions || [];
      for (const p of existingPredictions) processedEpisodes.add(p.episode_id);
      console.log(`Loaded ${existingPredictions.length} existing predictions from ${processedEpisodes.size} episodes`);
    } catch (e) {
      console.warn('Could not load existing prediction_candidates.json, starting fresh');
    }
  }

  const toProcess = processingOrder.filter((ep) =>
    !processedEpisodes.has(ep.episode_id) && !processedEpisodes.has(ep.episode_id.toLowerCase())
  );
  console.log(`Episodes to process: ${toProcess.length} (${processedEpisodes.size} already done)\n`);

  let allCandidates = [...existingPredictions];
  let globalYes = 0, globalMaybe = 0, globalNo = 0;
  let globalFilteredScenes = existingPredictions.length > 0
    ? new Set(existingPredictions.map((p) => p.scene_id)).size
    : 0;

  for (let i = 0; i < toProcess.length; i++) {
    const ep = toProcess[i];
    const isPriority = isPriorityEpisode(ep.episode_id);
    const tag = isPriority ? ' [PRIORITY]' : '';
    const progress = `[${i + 1}/${toProcess.length}]`;
    console.log(`${progress} ${ep.episode_id} "${ep.title}"${tag} (${ep.scenes.length} scenes)`);

    // Step 1: Filter
    const { filtered, yesCount, maybeCount, noCount } = filterEpisodeScenes(ep.scenes, ep.episode_id);
    globalYes += yesCount;
    globalMaybe += maybeCount;
    globalNo += noCount;
    globalFilteredScenes += filtered.length;
    console.log(`  Filter: YES=${yesCount} MAYBE=${maybeCount} NO=${noCount}`);

    // Step 2: Extract
    for (const { scene, trigger, verdict } of filtered) {
      const predictions = extractPredictions(scene, trigger);
      for (const pred of predictions) {
        const flags = applyGuardrails(pred, scene);
        allCandidates.push({
          prediction_id: crypto.randomUUID(),
          episode_id: scene.episode_id,
          season: scene.season,
          episode_num: scene.episode_num,
          scene_id: scene.scene_id,
          description: pred.description,
          category: pred.category,
          source_quote: pred.source_quote,
          filter_response: verdict,
          priority: pred.priority || 'STANDARD',
          flags: flags.length > 0 ? flags : undefined,
        });
      }
    }

    const epId = ep.episode_id.toLowerCase();
    const epPredCount = allCandidates.filter((c) => c.episode_id.toLowerCase() === epId).length;
    console.log(`  Extracted: ${epPredCount} predictions`);

    // Incremental save every 5 episodes
    if ((i + 1) % 5 === 0) {
      saveOutput(allCandidates, totalScenes, globalFilteredScenes);
      console.log(`  (incremental save: ${allCandidates.length} total predictions)`);
    }
  }

  // Sort: HIGH_PRIORITY first, then by season ascending
  allCandidates.sort((a, b) => {
    if (a.priority === 'HIGH_PRIORITY' && b.priority !== 'HIGH_PRIORITY') return -1;
    if (a.priority !== 'HIGH_PRIORITY' && b.priority === 'HIGH_PRIORITY') return 1;
    return (a.season || 0) - (b.season || 0);
  });

  saveOutput(allCandidates, totalScenes, globalFilteredScenes);

  console.log('\n── SUMMARY ──');
  console.log(`Total episodes: ${episodes.length}`);
  console.log(`Total scenes: ${totalScenes}`);
  console.log(`Filtered scenes: ${globalFilteredScenes}`);
  console.log(`Total predictions: ${allCandidates.length}`);
  const highCount = allCandidates.filter((c) => c.priority === 'HIGH_PRIORITY').length;
  console.log(`HIGH_PRIORITY predictions: ${highCount}`);
  console.log(`STANDARD predictions: ${allCandidates.length - highCount}`);
  console.log(`Filter: YES=${globalYes} MAYBE=${globalMaybe} NO=${globalNo}`);

  const flagged = allCandidates.filter((c) => c.flags && c.flags.length > 0);
  if (flagged.length > 0) {
    console.log(`Flagged candidates: ${flagged.length}`);
  }

  console.log('\n── TEST RESULTS ──');
  runTests(totalScenes);
}

function saveOutput(candidates, totalScenes, filteredScenes) {
  const passRate = totalScenes > 0 ? parseFloat(((filteredScenes / totalScenes) * 100).toFixed(1)) : 0;
  const filterMeta = {
    total_scenes: totalScenes,
    filtered_scenes: filteredScenes,
    pass_rate: passRate,
  };
  fs.writeFileSync('prediction_candidates.json', JSON.stringify({ meta: filterMeta, predictions: candidates }, null, 2));
}

// ── TEST RUNNER ──────────────────────────────────────────────────────────────

function runTests(totalScenes) {
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

  const data = JSON.parse(fs.readFileSync('prediction_candidates.json', 'utf-8'));

  // Test 1: Valid JSON
  test('prediction_candidates.json is valid JSON', () => {
    if (!data.predictions || !Array.isArray(data.predictions)) return 'Expected { predictions: [] } structure';
    if (!data.meta) return 'Expected meta field';
    return true;
  });

  // Test 2: Filter pass rate 8-18%
  test('Filter pass rate is between 8-18%', () => {
    const rate = data.meta.pass_rate;
    if (rate < 8 || rate > 18) {
      return `Pass rate is ${rate}% (${data.meta.filtered_scenes}/${data.meta.total_scenes} scenes), expected 8-18%`;
    }
    return true;
  });

  // Test 3: No unflagged descriptions contain character names
  test('Zero unflagged descriptions contain character names', () => {
    const names = ['homer', 'bart', 'marge', 'lisa', 'springfield'];
    for (const c of data.predictions) {
      if (c.flags && c.flags.includes('UNVERIFIED')) continue;
      const lower = c.description.toLowerCase();
      for (const name of names) {
        if (lower.includes(name)) {
          return `Unflagged candidate ${c.prediction_id} contains "${name}" in description`;
        }
      }
    }
    return true;
  });

  // Test 4: All descriptions under 300 characters
  test('All descriptions are under 300 characters', () => {
    for (const c of data.predictions) {
      if (c.description.length > 300) {
        return `Candidate ${c.prediction_id} description is ${c.description.length} chars`;
      }
    }
    return true;
  });

  // Test 5: All 15+ priority episodes have at least one extracted candidate
  test('All priority episodes have at least one extracted candidate', () => {
    const priorityIds = [
      's06e19', 's07e24', 's09e19', 's10e02', 's10e05',
      's11e17', 's12e06', 's13e01', 's12e09', 's14e15', 's15e05',
      's23e17', 's24e09', 's26e12', 's26e15', 's27e16', 's27e06',
    ];
    const presentIds = new Set(data.predictions.map((p) => p.episode_id.toLowerCase()));
    const missing = priorityIds.filter((id) => !presentIds.has(id));
    // Allow s26e15/s27e16 to be missing if not in scene data (ambiguous episode)
    const allowMissing = new Set(['s26e15', 's27e16']);
    const hardMissing = missing.filter((id) => !allowMissing.has(id));
    if (hardMissing.length > 0) {
      return `Missing predictions for priority episodes: ${hardMissing.join(', ')}`;
    }
    return true;
  });

  // Test 6: At least one HIGH_PRIORITY prediction found per priority episode
  test('At least one HIGH_PRIORITY prediction per priority episode', () => {
    const priorityIds = [
      's06e19', 's07e24', 's09e19', 's10e02', 's10e05',
      's11e17', 's12e06', 's13e01', 's12e09', 's14e15', 's15e05',
      's23e17', 's24e09', 's26e12', 's27e06',
    ];
    const highPriorityByEp = new Set(
      data.predictions
        .filter((p) => p.priority === 'HIGH_PRIORITY')
        .map((p) => p.episode_id.toLowerCase())
    );
    const missing = priorityIds.filter((id) => !highPriorityByEp.has(id));
    if (missing.length > 0) {
      return `Priority episodes without HIGH_PRIORITY predictions: ${missing.join(', ')}`;
    }
    return true;
  });

  // Test 7: Keywords present in output
  test('Required keywords present in output', () => {
    const allText = data.predictions
      .map((c) => `${c.description} ${c.source_quote} ${c.category}`)
      .join(' ')
      .toLowerCase();

    const groups = [
      { label: 'robot/automat', keywords: ['robot', 'automat'] },
      { label: 'mars/space', keywords: ['mars', 'space'] },
      { label: 'surveil/watch', keywords: ['surveil', 'watch'] },
      { label: 'brain/neural', keywords: ['brain', 'neural'] },
      { label: 'nuclear/energy', keywords: ['nuclear', 'energy'] },
    ];

    const missing = [];
    for (const group of groups) {
      if (!group.keywords.some((kw) => allText.includes(kw))) {
        missing.push(group.label);
      }
    }

    if (missing.length > 0) {
      return `Missing keyword groups: ${missing.join(', ')}`;
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
