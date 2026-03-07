#!/usr/bin/env node

const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');

const MOCK_MODE = process.argv.includes('--mock');
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const API_CALL_HARD_CAP = 500;

if (!MOCK_MODE && !ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY not set. Use --mock for heuristic mode.');
  process.exit(1);
}

// ── API CALL TRACKING ───────────────────────────────────────────────────────

let apiCallCount = 0;
let totalInputTokens = 0;
let totalOutputTokens = 0;

function callClaude(systemPrompt, userMessage) {
  if (apiCallCount >= API_CALL_HARD_CAP) {
    throw new Error(`API call hard cap reached (${API_CALL_HARD_CAP})`);
  }

  const body = JSON.stringify({
    model: HAIKU_MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const result = execSync(`curl -sS --max-time 90 "${ANTHROPIC_BASE_URL}/v1/messages" \
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

  apiCallCount++;
  if (parsed.usage) {
    totalInputTokens += parsed.usage.input_tokens || 0;
    totalOutputTokens += parsed.usage.output_tokens || 0;
  }

  return parsed.content[0].text;
}

// ── PRIORITY EPISODES ───────────────────────────────────────────────────────

const PRIORITY_EPISODE_IDS = new Set([
  's06e19', 's07e24', 's09e19', 's10e02', 's10e05',
  's11e17', 's12e06', 's13e01', 's12e09', 's14e15', 's15e05',
  's23e17', 's24e09', 's26e12', 's26e15', 's27e16', 's27e06',
]);

function isPriorityEpisode(episode_id) {
  return PRIORITY_EPISODE_IDS.has(episode_id.toLowerCase());
}

// ── STEP 1: RULE-BASED PRE-FILTER (no API cost) ────────────────────────────

const KEYWORD_GROUPS = {
  future: ['will', 'someday', 'future', 'one day', 'by the year',
    'in the future', 'eventually', 'predict', 'century'],
  technology: ['computer', 'robot', 'machine', 'internet', 'phone',
    'device', 'screen', 'chip', 'network', 'satellite', 'automated', 'ai'],
  power: ['president', 'government', 'corporation', 'power',
    'control', 'own', 'congress', 'military', 'surveillance'],
  science: ['scientist', 'experiment', 'discovered', 'invention', 'formula',
    'nuclear', 'space', 'planet', 'brain', 'gene'],
  economics: ['company', 'billion', 'monopoly', 'bankrupt', 'economy',
    'market', 'profit', 'wage', 'worker', 'job'],
};

function ruleBasedPreFilter(scene) {
  const text = scene.dialogue_lines.map((l) => l.text).join(' ').toLowerCase();
  const matchedGroups = {};
  let totalMatches = 0;

  for (const [group, keywords] of Object.entries(KEYWORD_GROUPS)) {
    const hits = keywords.filter((kw) => text.includes(kw));
    if (hits.length > 0) {
      matchedGroups[group] = hits;
      totalMatches += hits.length;
    }
  }

  const groupCount = Object.keys(matchedGroups).length;
  // Require matches from at least 2 keyword groups to pass,
  // OR priority episodes pass with 1 group if 2+ keyword hits
  const isPriority = isPriorityEpisode(scene.episode_id);
  const pass = groupCount >= 2 || (isPriority && totalMatches >= 2);

  return { pass, matchedGroups, totalMatches };
}

// ── STEP 2: API FILTER (batched, haiku) ─────────────────────────────────────

const BATCH_FILTER_SYSTEM_PROMPT = `You are a content filter for Springfield Oracle, a database of real-world predictions hidden in Simpsons dialogue.
For each scene below, respond YES, MAYBE, or NO.
YES = scene contains a statement about how the real world (technology, government, economics, science, corporations, media, or society) might change or develop in the future.
MAYBE = scene contains a hint or implication but is not explicit.
NO = scene is purely plot, character interaction, or comedy with no world-state commentary.
Respond ONLY as JSON array in same order as input:
[{ "scene_id": "...", "verdict": "YES|MAYBE|NO", "trigger_line": "..." }]
trigger_line is the specific line that triggered YES or MAYBE.
If NO, trigger_line is null.
Be terse. No explanation beyond trigger_line.`;

function mockBatchFilter(batch) {
  return batch.map((scene) => {
    const text = scene.dialogue_lines.map((l) => l.text).join(' ').toLowerCase();
    const futureHits = KEYWORD_GROUPS.future.filter((kw) => text.includes(kw));
    const techHits = KEYWORD_GROUPS.technology.filter((kw) => text.includes(kw));
    const powerHits = KEYWORD_GROUPS.power.filter((kw) => text.includes(kw));
    const sciHits = KEYWORD_GROUPS.science.filter((kw) => text.includes(kw));
    const econHits = KEYWORD_GROUPS.economics.filter((kw) => text.includes(kw));
    const allHits = [...futureHits, ...techHits, ...powerHits, ...sciHits, ...econHits];

    const groupCount = [futureHits, techHits, powerHits, sciHits, econHits].filter((h) => h.length > 0).length;
    const isPriority = isPriorityEpisode(scene.episode_id);

    // Target: pass ~50-60% of pre-filtered scenes to land at 10-15% of total
    let verdict = 'NO';
    if (groupCount >= 3 && allHits.length >= 4) {
      verdict = 'YES';
    } else if (groupCount >= 2 && allHits.length >= 3) {
      verdict = 'MAYBE';
    } else if (groupCount >= 3) {
      verdict = 'MAYBE';
    } else if (groupCount >= 2 && futureHits.length > 0) {
      verdict = 'MAYBE';
    } else if (isPriority && groupCount >= 2) {
      verdict = 'MAYBE';
    }

    let trigger_line = null;
    if (verdict !== 'NO') {
      const trigLine = scene.dialogue_lines.find((l) =>
        allHits.some((kw) => l.text.toLowerCase().includes(kw))
      );
      trigger_line = trigLine ? trigLine.text : null;
    }

    return { scene_id: scene.scene_id, verdict, trigger_line };
  });
}

function apiBatchFilter(batch) {
  const scenesText = batch.map((scene, i) => {
    const dialogue = scene.dialogue_lines
      .map((l) => `${l.speaker}: ${l.text}`)
      .join('\n');
    return `--- Scene ${i + 1}: ${scene.scene_id} ---\n${dialogue}`;
  }).join('\n\n');

  const response = callClaude(BATCH_FILTER_SYSTEM_PROMPT, scenesText);

  let jsonStr = response;
  const codeBlock = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) jsonStr = codeBlock[1];
  const arrMatch = jsonStr.match(/\[[\s\S]*\]/);
  if (arrMatch) jsonStr = arrMatch[0];

  try {
    const results = JSON.parse(jsonStr);
    // Ensure correct order and fill missing entries
    return batch.map((scene, i) => {
      const match = results.find((r) => r.scene_id === scene.scene_id) || results[i];
      return {
        scene_id: scene.scene_id,
        verdict: (match && match.verdict) ? match.verdict.toUpperCase() : 'NO',
        trigger_line: (match && match.trigger_line) || null,
      };
    });
  } catch (e) {
    console.warn(`  Warning: Failed to parse batch filter response, defaulting to MAYBE`);
    return batch.map((scene) => ({
      scene_id: scene.scene_id,
      verdict: 'MAYBE',
      trigger_line: null,
    }));
  }
}

function batchFilter(batch) {
  if (MOCK_MODE) return mockBatchFilter(batch);
  return apiBatchFilter(batch);
}

// ── STEP 3: WORLD-STATE EXTRACTION ──────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `You are a prediction extractor for Springfield Oracle.
Extract the real-world prediction implied by this scene.
Rules:
1. No Simpsons references — no character names, no Springfield
2. Present tense, factual statement
3. Specific: 'wristwatch video calls' not 'wearable technology'
4. Max 2 sentences
5. Multiple distinct predictions = multiple objects
6. If nothing extractable: { "predictions": [] }
Return ONLY JSON:
{ "predictions": [
  {
    "description": "string",
    "category": "string",
    "source_quote": "string",
    "priority": "string"
  }
]}
category options: technology | government | economics | science | space | media | surveillance | war | corporate | climate | biotech
priority: HIGH_PRIORITY if matches any of:
AI labour replacement, tech billionaire political power, Mars colonisation,
mass surveillance, nuclear energy revival, brain-computer interfaces,
smart home AI sentience, electoral manipulation, Middle East conflict.
Otherwise: STANDARD`;

const HIGH_PRIORITY_KEYWORDS = [
  'robot', 'automat', 'ai ', 'artificial intelligence', 'replace',
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

const CATEGORY_KEYWORD_MAP = {
  technology: ['robot', 'automat', 'computer', 'machine', 'device', 'phone', 'screen', 'digital', 'virtual', 'hologram', 'wristwatch', 'video call', 'artificial', 'intelligent', 'smart home', 'sentient', 'brain', 'neural', 'implant', 'interface'],
  government: ['government', 'president', 'election', 'vote', 'law', 'policy', 'senator', 'congress', 'manipulat', 'rigged'],
  economics: ['money', 'economy', 'market', 'bank', 'stock', 'trade', 'inflation', 'currency', 'crypto', 'insider', 'prediction market', 'billion', 'monopoly', 'profit', 'wage', 'worker', 'job'],
  science: ['science', 'nuclear', 'energy', 'physics', 'chemistry', 'research', 'reactor', 'atomic', 'formula', 'experiment'],
  space: ['space', 'nasa', 'rocket', 'mars', 'moon', 'satellite', 'orbit', 'coloniz', 'colonise', 'planet'],
  media: ['media', 'news', 'broadcast', 'television', 'internet', 'online', 'streaming'],
  surveillance: ['surveillance', 'camera', 'monitor', 'spy', 'track', 'privacy', 'censor', 'data'],
  war: ['war', 'military', 'weapon', 'army', 'missile', 'drone', 'bomb', 'middle east', 'conflict'],
  corporate: ['corporation', 'company', 'business', 'merger', 'ceo', 'corporate', 'billionaire', 'tycoon', 'mogul'],
  climate: ['climate', 'pollution', 'environment', 'warming', 'weather', 'emission'],
  biotech: ['genetic', 'clone', 'biotech', 'medicine', 'drug', 'health', 'dna', 'gene'],
};

function mockExtract(scene, triggerLine) {
  const text = scene.dialogue_lines.map((l) => l.text).join(' ').toLowerCase();
  const predictions = [];

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORD_MAP)) {
    const matched = keywords.filter((kw) => text.includes(kw));
    if (matched.length > 0) {
      const sourceLine = scene.dialogue_lines.find((l) =>
        matched.some((kw) => l.text.toLowerCase().includes(kw))
      );
      const sourceQuote = sourceLine ? sourceLine.text : (triggerLine || '');
      const desc = `${matched.map((kw) => kw.charAt(0).toUpperCase() + kw.slice(1)).join(' and ')}-related systems become commonplace in everyday life.`;
      predictions.push({
        description: desc.substring(0, 300),
        category,
        source_quote: sourceQuote,
        priority: inferPriority(text),
      });
    }
  }

  return predictions.length > 0 ? predictions.slice(0, 3) : [];
}

function apiExtract(scene, triggerLine) {
  const dialogue = scene.dialogue_lines
    .map((l) => `${l.speaker}: ${l.text}`)
    .join('\n');

  const userMsg = `Scene dialogue:\n${dialogue}${triggerLine ? `\n\nFilter trigger line: ${triggerLine}` : ''}`;
  const response = callClaude(EXTRACTION_SYSTEM_PROMPT, userMsg);

  let jsonStr = response;
  const codeBlock = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) jsonStr = codeBlock[1];
  const rawMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (rawMatch) jsonStr = rawMatch[0];

  try {
    const parsed = JSON.parse(jsonStr);
    return (parsed.predictions || []).map((p) => ({
      ...p,
      priority: p.priority || inferPriority(`${p.description} ${p.source_quote}`),
    }));
  } catch (e) {
    console.warn(`    Warning: Failed to parse extraction for ${scene.scene_id}`);
    return [];
  }
}

function extractPredictions(scene, triggerLine) {
  if (MOCK_MODE) return mockExtract(scene, triggerLine);
  return apiExtract(scene, triggerLine);
}

// ── GUARDRAILS ──────────────────────────────────────────────────────────────

const SIMPSONS_NAMES = ['homer', 'bart', 'marge', 'lisa', 'springfield', 'maggie', 'burns', 'flanders', 'krusty', 'moe'];

function applyGuardrails(candidate, scene) {
  let needs_review = false;
  let unverified_quote = false;

  const descLower = candidate.description.toLowerCase();
  for (const name of SIMPSONS_NAMES) {
    if (descLower.includes(name)) {
      needs_review = true;
      break;
    }
  }

  if (candidate.source_quote && scene.raw_text) {
    if (!scene.raw_text.includes(candidate.source_quote)) {
      unverified_quote = true;
    }
  } else if (candidate.source_quote) {
    const allDialogue = scene.dialogue_lines.map((l) => l.text).join(' ');
    if (!allDialogue.includes(candidate.source_quote)) {
      unverified_quote = true;
    }
  }

  return { needs_review, unverified_quote };
}

// ── MAIN PIPELINE ───────────────────────────────────────────────────────────

function main() {
  console.log(`Mode: ${MOCK_MODE ? 'MOCK (heuristic)' : 'LIVE (Claude API)'}`);
  console.log(`API call hard cap: ${API_CALL_HARD_CAP}\n`);

  const scenesData = JSON.parse(fs.readFileSync('scenes.json', 'utf-8'));
  const episodes = scenesData.episodes || [];
  const totalSceneCount = episodes.reduce((sum, ep) => sum + ep.scenes.length, 0);
  console.log(`Loaded ${episodes.length} episodes, ${totalSceneCount} total scenes`);

  // Flatten all scenes, tag with episode metadata
  const allScenes = [];
  for (const ep of episodes) {
    for (const scene of ep.scenes) {
      allScenes.push(scene);
    }
  }

  // ── STEP 1: RULE-BASED PRE-FILTER ──────────────────────────────────────

  console.log('\n── STEP 1: RULE-BASED PRE-FILTER ──');
  const preFiltered = [];

  for (const scene of allScenes) {
    const { pass } = ruleBasedPreFilter(scene);
    if (pass) {
      preFiltered.push(scene);
    }
  }

  const preFilterPct = ((preFiltered.length / allScenes.length) * 100).toFixed(1);
  console.log(`Input: ${allScenes.length} scenes`);
  console.log(`Output: ${preFiltered.length} scenes (${preFilterPct}% kept)`);
  console.log(`Discarded: ${allScenes.length - preFiltered.length} scenes with zero keyword matches`);

  // ── STEP 2: API FILTER (batched) ───────────────────────────────────────

  console.log('\n── STEP 2: API FILTER (batched, 5 scenes/call) ──');
  const BATCH_SIZE = 5;
  const apiFiltered = []; // { scene, verdict, trigger_line }
  let apiFilterCalls = 0;
  let yesCount = 0, maybeCount = 0, noCount = 0;

  // Process in batches of 5
  for (let i = 0; i < preFiltered.length; i += BATCH_SIZE) {
    const batch = preFiltered.slice(i, i + BATCH_SIZE);

    if (!MOCK_MODE && apiCallCount >= API_CALL_HARD_CAP) {
      console.warn(`  API call cap reached at batch ${Math.floor(i / BATCH_SIZE) + 1}, stopping filter`);
      break;
    }

    const results = batchFilter(batch);
    apiFilterCalls++;

    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.verdict === 'YES') {
        yesCount++;
        apiFiltered.push({ scene: batch[j], verdict: 'YES', trigger_line: r.trigger_line });
      } else if (r.verdict === 'MAYBE') {
        maybeCount++;
        apiFiltered.push({ scene: batch[j], verdict: 'MAYBE', trigger_line: r.trigger_line });
      } else {
        noCount++;
      }
    }

    if ((Math.floor(i / BATCH_SIZE) + 1) % 50 === 0) {
      process.stdout.write(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(preFiltered.length / BATCH_SIZE)}...\n`);
    }
  }

  const apiFilterPct = ((apiFiltered.length / allScenes.length) * 100).toFixed(1);
  console.log(`API filter: YES=${yesCount} MAYBE=${maybeCount} NO=${noCount}`);
  console.log(`Output: ${apiFiltered.length} scenes (${apiFilterPct}% of original)`);
  console.log(`API calls used for filter: ${apiFilterCalls}`);

  // ── STEP 3: WORLD-STATE EXTRACTION ─────────────────────────────────────

  console.log('\n── STEP 3: WORLD-STATE EXTRACTION ──');
  const allCandidates = [];
  let extractionCalls = 0;

  for (let i = 0; i < apiFiltered.length; i++) {
    const { scene, verdict, trigger_line } = apiFiltered[i];

    if (!MOCK_MODE && apiCallCount >= API_CALL_HARD_CAP) {
      console.warn(`  API call cap reached at extraction ${i + 1}, stopping`);
      break;
    }

    const predictions = extractPredictions(scene, trigger_line);
    extractionCalls++;

    for (const pred of predictions) {
      const { needs_review, unverified_quote } = applyGuardrails(pred, scene);
      allCandidates.push({
        prediction_id: crypto.randomUUID(),
        episode_id: scene.episode_id,
        season: scene.season,
        episode_num: scene.episode_num,
        scene_id: scene.scene_id,
        description: pred.description,
        category: pred.category,
        source_quote: pred.source_quote,
        filter_verdict: verdict,
        priority: pred.priority || 'STANDARD',
        needs_review: needs_review || undefined,
        unverified_quote: unverified_quote || undefined,
      });
    }

    if ((i + 1) % 100 === 0) {
      process.stdout.write(`  Extracted ${i + 1}/${apiFiltered.length} scenes (${allCandidates.length} predictions so far)\n`);
    }
  }

  console.log(`Extraction API calls: ${extractionCalls}`);
  console.log(`Raw predictions: ${allCandidates.length}`);

  // ── STEP 4: SORT AND OUTPUT ────────────────────────────────────────────

  console.log('\n── STEP 4: OUTPUT ──');

  // Sort: HIGH_PRIORITY first, then season ASC
  allCandidates.sort((a, b) => {
    if (a.priority === 'HIGH_PRIORITY' && b.priority !== 'HIGH_PRIORITY') return -1;
    if (a.priority !== 'HIGH_PRIORITY' && b.priority === 'HIGH_PRIORITY') return 1;
    return (a.season || 0) - (b.season || 0);
  });

  const meta = {
    total_input_scenes: allScenes.length,
    prefilter_kept: preFiltered.length,
    prefilter_pct: parseFloat(preFilterPct),
    api_filter_kept: apiFiltered.length,
    api_filter_pct: parseFloat(apiFilterPct),
    total_predictions: allCandidates.length,
    high_priority_count: allCandidates.filter((c) => c.priority === 'HIGH_PRIORITY').length,
    api_calls_total: apiCallCount,
    api_calls_filter: apiFilterCalls,
    api_calls_extraction: extractionCalls,
  };

  const output = { meta, predictions: allCandidates };
  fs.writeFileSync('prediction_candidates.json', JSON.stringify(output, null, 2));
  console.log('Saved prediction_candidates.json');

  // ── COST SUMMARY ───────────────────────────────────────────────────────

  console.log('\n── COST SUMMARY ──');
  console.log(`Total API calls: ${apiCallCount} / ${API_CALL_HARD_CAP} cap`);
  if (totalInputTokens > 0) {
    const inputCost = (totalInputTokens / 1_000_000) * 1.0;  // haiku pricing
    const outputCost = (totalOutputTokens / 1_000_000) * 5.0;
    console.log(`Input tokens: ${totalInputTokens.toLocaleString()}`);
    console.log(`Output tokens: ${totalOutputTokens.toLocaleString()}`);
    console.log(`Estimated cost: $${(inputCost + outputCost).toFixed(4)}`);
  } else {
    console.log('(mock mode — no tokens consumed)');
  }

  // ── SUMMARY ────────────────────────────────────────────────────────────

  console.log('\n── SUMMARY ──');
  console.log(`Total scenes: ${allScenes.length}`);
  console.log(`Pre-filter kept: ${preFiltered.length} (${preFilterPct}%)`);
  console.log(`API filter kept: ${apiFiltered.length} (${apiFilterPct}%)`);
  console.log(`Total predictions: ${allCandidates.length}`);
  console.log(`HIGH_PRIORITY: ${meta.high_priority_count}`);
  console.log(`STANDARD: ${allCandidates.length - meta.high_priority_count}`);

  const reviewCount = allCandidates.filter((c) => c.needs_review).length;
  const quoteCount = allCandidates.filter((c) => c.unverified_quote).length;
  if (reviewCount > 0) console.log(`needs_review flagged: ${reviewCount}`);
  if (quoteCount > 0) console.log(`unverified_quote flagged: ${quoteCount}`);

  // ── TESTS ──────────────────────────────────────────────────────────────

  console.log('\n── TEST RESULTS ──');
  runTests();
}

// ── TEST RUNNER ─────────────────────────────────────────────────────────────

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

  const data = JSON.parse(fs.readFileSync('prediction_candidates.json', 'utf-8'));

  // Test 1: Valid JSON
  test('prediction_candidates.json is valid JSON', () => {
    if (!data.predictions || !Array.isArray(data.predictions)) return 'Expected { predictions: [] } structure';
    if (!data.meta) return 'Expected meta field';
    if (data.predictions.length === 0) return 'Predictions array is empty';
    return true;
  });

  // Test 2: Total API calls under 500
  test('Total API calls under 500', () => {
    const calls = data.meta.api_calls_total;
    if (calls > 500) {
      return `Used ${calls} API calls, cap is 500`;
    }
    return true;
  });

  // Test 3: Zero unflagged descriptions contain character names
  test('Zero unflagged descriptions contain character names', () => {
    const names = ['homer', 'bart', 'marge', 'lisa', 'springfield'];
    for (const c of data.predictions) {
      if (c.needs_review) continue;
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

  // Test 5: Priority episodes each have at least 1 candidate
  test('Priority episodes S06E19, S09E19, S11E17, S23E17, S26E12 each have at least 1 candidate', () => {
    const required = ['s06e19', 's09e19', 's11e17', 's23e17', 's26e12'];
    const presentIds = new Set(data.predictions.map((p) => p.episode_id.toLowerCase()));
    const missing = required.filter((id) => !presentIds.has(id));
    if (missing.length > 0) {
      return `Missing predictions for priority episodes: ${missing.join(', ')}`;
    }
    return true;
  });

  // Test 6: At least 10 HIGH_PRIORITY candidates in output
  test('At least 10 HIGH_PRIORITY candidates in output', () => {
    const highCount = data.predictions.filter((p) => p.priority === 'HIGH_PRIORITY').length;
    if (highCount < 10) {
      return `Only ${highCount} HIGH_PRIORITY candidates, expected at least 10`;
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
