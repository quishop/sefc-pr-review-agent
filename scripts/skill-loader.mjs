// shared-workflows/scripts/skill-loader.mjs
// 動態 skill 載入器 — 偵測 changed files，載入對應的 review skills
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = resolve(__dirname, '..', 'skills');

function getChangedFiles() {
  try {
    const base = process.env.BASE_REF || 'main';
    const output = execSync(`git diff --name-only origin/${base}...HEAD`, { encoding: 'utf8' });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    console.warn('  Cannot get changed files, loading required skills only');
    return [];
  }
}

function loadSkill(filename) {
  const path = `${SKILLS_DIR}/${filename}`;
  if (!existsSync(path)) {
    console.warn(`  Skill not found: ${path}`);
    return '';
  }
  return readFileSync(path, 'utf8');
}

export function loadSkills() {
  const changedFiles = getChangedFiles();
  const loaded = [];
  const names = [];

  // Required skills (always loaded)
  for (const skill of ['review.md', 'naming.md', 'security.md']) {
    const content = loadSkill(skill);
    if (content) { loaded.push(content); names.push(skill); }
  }

  // Conditional skills (loaded based on changed files)
  const conditional = [
    {
      skill: 'typescript.md',
      condition: changedFiles.some(f => f.endsWith('.ts') || f.endsWith('.tsx')),
    },
    {
      skill: 'react.md',
      condition: changedFiles.some(f =>
        (f.endsWith('.js') || f.endsWith('.jsx')) &&
        !f.includes('node_modules') && !f.endsWith('.config.js')
      ),
    },
    {
      skill: 'python.md',
      condition: changedFiles.some(f => f.endsWith('.py')),
    },
    {
      skill: 'migration.md',
      condition: changedFiles.some(f =>
        f.includes('migration') || f.includes('schema')
      ),
    },
    {
      skill: 'api.md',
      condition: changedFiles.some(f =>
        f.includes('routes') || f.includes('controllers') ||
        f.includes('handlers') || f.includes('views') ||
        f.includes('serializers') || f.includes('urls.py')
      ),
    },
    {
      skill: 'infra.md',
      condition: changedFiles.some(f =>
        f.endsWith('.tf') || f.includes('k8s/') ||
        f.includes('helm/') || f.includes('Dockerfile') ||
        f.includes('.github/workflows/')
      ),
    },
  ];

  for (const { skill, condition } of conditional) {
    if (condition) {
      const content = loadSkill(skill);
      if (content) { loaded.push(content); names.push(skill); }
    }
  }

  console.log(`Skills loaded (${names.length}): ${names.join(', ')}`);
  return { content: loaded.join('\n\n---\n\n'), names };
}
