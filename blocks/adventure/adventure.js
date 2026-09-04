/*
 * Adventure Block
 * Displays adventure information: a set of "at a glance" attributes shown to the
 * side (activity, adventure type, trip length, group size, difficulty, price) and
 * long-form content (overview, itinerary, what to bring) presented in tabs.
 *
 * Content model: the block is a simple table where every row is a key / value pair.
 *   | Adventure                          |
 *   | Activity      | Skiing             |
 *   | Trip Length   | 5 Days             |
 *   | Overview      | <rich text>        |
 *   | Itinerary     | <rich text>        |
 *   | What to Bring | <rich text>        |
 *
 * Alternatively the block can reference a fragment that holds the same rows. Author
 * either a link to the fragment or a single "Fragment" / "Path" row, e.g.
 *   | Adventure |                                    |
 *   | Fragment  | /fragments/adventures/bali-surf-camp |
 * The block fetches the fragment, reads its adventure rows and renders identically.
 */

import { toClassName } from '../../scripts/aem.js';

// keys rendered as side attributes, in display order
const ATTRIBUTE_KEYS = [
  'activity',
  'adventure type',
  'trip length',
  'group size',
  'difficulty',
  'price',
];

// keys rendered as tabs, in display order
const TAB_KEYS = [
  'overview',
  'itinerary',
  'what to bring',
];

// keys that point at a fragment holding the real data
const FRAGMENT_KEYS = ['fragment', 'path', 'reference'];

/**
 * Reads an adventure table into an ordered map of key -> value element.
 * Each row is expected to be a two-cell key/value pair. A single-cell row is
 * treated as a heading/label and skipped.
 * @param {HTMLElement} root Element containing the adventure rows
 * @returns {Map<string, HTMLElement>} map of lower-cased key to value cell
 */
function readRows(root) {
  const data = new Map();
  root.querySelectorAll(':scope > div').forEach((row) => {
    const cells = [...row.children];
    if (cells.length < 2) return;
    const key = cells[0].textContent.trim().toLowerCase();
    if (key) data.set(key, cells[1]);
  });
  return data;
}

/**
 * Resolves a fragment path from the block: either a link href or a fragment row.
 * @param {Map<string, HTMLElement>} data parsed rows
 * @param {HTMLElement} block the block element
 * @returns {string|null} the fragment path or null
 */
function getFragmentPath(data, block) {
  const fragmentEntry = FRAGMENT_KEYS.map((k) => data.get(k)).find(Boolean);
  if (fragmentEntry) {
    const link = fragmentEntry.querySelector('a');
    return (link ? link.getAttribute('href') : fragmentEntry.textContent).trim();
  }
  // fall back to a lone link inside the block (e.g. a single-row fragment reference)
  const link = block.querySelector('a');
  if (link && data.size <= 1) return link.getAttribute('href').trim();
  return null;
}

/**
 * Loads adventure rows from a fragment's plain html.
 * @param {string} path fragment path
 * @returns {Promise<Map<string, HTMLElement>|null>}
 */
async function loadFragmentRows(path) {
  if (!path) return null;
  const url = path.startsWith('http') ? new URL(path).pathname : path;
  const resp = await fetch(`${url}.plain.html`);
  if (!resp.ok) return null;
  const container = document.createElement('div');
  container.innerHTML = await resp.text();
  // fragment may wrap the rows in an .adventure block or a metadata table
  const source = container.querySelector('.adventure, .metadata') || container.firstElementChild || container;
  return readRows(source);
}

/**
 * Builds the side attributes definition list.
 * @param {Map<string, HTMLElement>} data parsed rows
 * @returns {HTMLElement} the attributes aside
 */
function buildAttributes(data) {
  const aside = document.createElement('div');
  aside.className = 'adventure-attributes';
  const dl = document.createElement('dl');
  ATTRIBUTE_KEYS.forEach((key) => {
    const value = data.get(key);
    if (!value) return;
    const dt = document.createElement('dt');
    dt.textContent = value.dataset.label || key.replace(/\b\w/g, (c) => c.toUpperCase());
    const dd = document.createElement('dd');
    dd.innerHTML = value.innerHTML.trim();
    dl.append(dt, dd);
  });
  aside.append(dl);
  return aside;
}

/**
 * Builds the tabbed long-form content.
 * @param {Map<string, HTMLElement>} data parsed rows
 * @returns {HTMLElement} the tabs container
 */
function buildTabs(data) {
  const wrapper = document.createElement('div');
  wrapper.className = 'adventure-tabs';

  const tablist = document.createElement('div');
  tablist.className = 'adventure-tabs-list';
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', 'adventure trip details');
  wrapper.append(tablist);

  const available = TAB_KEYS.filter((key) => data.get(key));
  available.forEach((key, i) => {
    const value = data.get(key);
    const id = toClassName(key);
    const label = key.replace(/\b\w/g, (c) => c.toUpperCase());

    // panel
    const panel = document.createElement('div');
    panel.className = 'adventure-tabs-panel';
    panel.id = `adventure-tabpanel-${id}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `adventure-tab-${id}`);
    panel.setAttribute('aria-hidden', i ? 'true' : 'false');
    panel.innerHTML = value.innerHTML;

    // tab button
    const button = document.createElement('button');
    button.className = 'adventure-tabs-tab';
    button.id = `adventure-tab-${id}`;
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', `adventure-tabpanel-${id}`);
    button.setAttribute('aria-selected', i ? 'false' : 'true');
    button.addEventListener('click', () => {
      wrapper.querySelectorAll('[role=tabpanel]').forEach((p) => p.setAttribute('aria-hidden', 'true'));
      tablist.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', 'false'));
      panel.setAttribute('aria-hidden', 'false');
      button.setAttribute('aria-selected', 'true');
    });

    tablist.append(button);
    wrapper.append(panel);
  });

  return wrapper;
}

export default async function decorate(block) {
  const data = readRows(block);

  // if the block references a fragment, load the rows from there
  const fragmentPath = getFragmentPath(data, block);
  if (fragmentPath) {
    const fragmentData = await loadFragmentRows(fragmentPath);
    if (fragmentData) {
      // fragment rows take precedence; keep any inline rows as fallback
      fragmentData.forEach((v, k) => data.set(k, v));
    }
  }

  block.textContent = '';

  const layout = document.createElement('div');
  layout.className = 'adventure-layout';

  const main = document.createElement('div');
  main.className = 'adventure-main';
  main.append(buildTabs(data));

  layout.append(buildAttributes(data), main);
  block.append(layout);
}
