// Phase 8.1 — static/source assertions. No browser needed.
import { readFileSync } from 'fs';

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log(`OK   ${label}`); }
  else { fail++; console.log(`FAIL ${label}`); }
}

const styleCss = readFileSync('style.css', 'utf8');
const platformCss = readFileSync('platform.css', 'utf8');
const engineeringCss = readFileSync('engineering.css', 'utf8');
const pettyCashCss = readFileSync('petty-cash.css', 'utf8');
const paletteJs = readFileSync('js/shell/command-palette.js', 'utf8');

// 1. Global data-anim="off" blanket rule (style.css)
check('style.css has global [data-anim="off"] blanket rule',
  /\[data-anim="off"\]\s*\*,\s*\n\[data-anim="off"\]\s*\*::before,\s*\n\[data-anim="off"\]\s*\*::after\s*\{/.test(styleCss));

// 2. --ease-accelerate removed, --ease-overshoot added (style.css)
check('style.css no longer declares --ease-accelerate', !/--ease-accelerate:/.test(styleCss));
check('style.css declares --ease-overshoot exactly once',
  (styleCss.match(/--ease-overshoot:\s*cubic-bezier/g) || []).length === 1);

// 3. --ease-overshoot referenced at exactly 3 call sites (style.css x2 + platform.css x1)
const styleOvershootRefs = (styleCss.match(/var\(--ease-overshoot/g) || []).length;
const platformOvershootRefs = (platformCss.match(/var\(--ease-overshoot/g) || []).length;
check('var(--ease-overshoot) referenced exactly 3 times total (style.css:2 + platform.css:1)',
  styleOvershootRefs === 2 && platformOvershootRefs === 1);

// 4. VSM-6 :root no longer declares --motion-fast/--motion-slow; --motion-normal aliases --motion-base
const vsm6RootMatch = platformCss.match(/Part 1: Motion tokens[\s\S]{0,600}?\n:root \{([\s\S]*?)\}/);
check('VSM-6 :root block found', !!vsm6RootMatch);
if (vsm6RootMatch) {
  const block = vsm6RootMatch[1];
  check('VSM-6 :root no longer declares --motion-fast', !/--motion-fast:/.test(block));
  check('VSM-6 :root no longer declares --motion-slow', !/--motion-slow:/.test(block));
  check('VSM-6 :root --motion-normal aliases var(--motion-base', /--motion-normal:\s*var\(--motion-base/.test(block));
  check('VSM-6 :root --motion-ease untouched', /--motion-ease:\s*cubic-bezier\(0\.16, 1, 0\.3, 1\)/.test(block));
}

// 5. Dead tokens removed: --motion-view, --motion-theme, --exec-ease
check('platform.css no longer declares --motion-view', !/--motion-view:\s*\d/.test(platformCss));
check('platform.css no longer declares --motion-theme', !/--motion-theme:\s*\d/.test(platformCss));
check('platform.css no longer declares --exec-ease', !/--exec-ease:\s*cubic-bezier/.test(platformCss));
// real tokens still present
check('platform.css still declares --motion-pop', /--motion-pop:\s*160ms/.test(platformCss));
check('platform.css still declares --motion-sheet', /--motion-sheet:\s*260ms/.test(platformCss));
check('.exec-ui still declares --exec-dur/--exec-dur-fast', /--exec-dur:\s*\.2s/.test(platformCss) && /--exec-dur-fast:\s*\.14s/.test(platformCss));

// 6. Toggle knobs use transform, not left
check('platform.css .p-switch::after uses transition:transform', /\.p-switch::after \{[\s\S]*?transition: transform \.15s;/.test(platformCss));
check('platform.css .p-switch.on::after uses transform:translateX', /\.p-switch\.on::after \{ transform: translateX\(17px\); \}/.test(platformCss));
check('engineering.css .eng-toggle-knob uses transition:transform', /\.eng-toggle-knob\{[^}]*transition:transform \.15s;/.test(engineeringCss));
check('engineering.css toggle "on" state uses transform:translateX', /\.eng-toggle\[data-on="true"\] \.eng-toggle-knob\{transform:translateX\(17px\);\}/.test(engineeringCss));
check('no remaining transition:left on either toggle knob', !/transition:\s*left \.15s/.test(engineeringCss) && !/transition: left \.15s/.test(platformCss));

// 7. Rail hover debounce
check('platform.css rail :hover/:focus-within has 100ms-delayed width transition',
  /\.domshell-rail:hover,\s*\n\.domshell-rail:focus-within \{[\s\S]*?transition: width var\(--motion-normal, 200ms\) var\(--motion-ease, ease\) 100ms;/.test(platformCss));
check('platform.css .main-area hover reflow has 100ms-delayed margin-left transition',
  /margin-left: 220px;\s*\n[\s\S]{0,300}?transition: margin-left var\(--motion-normal, 200ms\) var\(--motion-ease, ease\) 100ms;/.test(platformCss));

// 8. Command palette stagger CSS present
check('platform.css defines .domshell-palette-item--enter', /\.domshell-palette-item--enter \{ animation: v2FadeInScale/.test(platformCss));
check('platform.css defines 3-step stagger delays for palette items',
  /:nth-of-type\(1\) \{ animation-delay: \.04s; \}/.test(platformCss) &&
  /:nth-of-type\(2\) \{ animation-delay: \.12s; \}/.test(platformCss) &&
  /:nth-of-type\(n\+3\) \{ animation-delay: \.2s; \}/.test(platformCss));

// 9. petty-cash.css dead keyframes pruned, live ones kept
check('petty-cash.css no longer declares @keyframes pcSpin', !/@keyframes pcSpin/.test(pettyCashCss));
check('petty-cash.css no longer declares @keyframes pcPulse', !/@keyframes pcPulse/.test(pettyCashCss));
check('petty-cash.css still declares @keyframes pcPop', /@keyframes pcPop/.test(pettyCashCss));
check('petty-cash.css still declares @keyframes pcFade', /@keyframes pcFade/.test(pettyCashCss));

// 10. command-palette.js changes
check('command-palette.js imports prefersReducedMotion', /import \{ prefersReducedMotion \} from '\.\.\/components\/motion-tokens\.js';/.test(paletteJs));
check('command-palette.js declares staggerNext flag', /let staggerNext = true;/.test(paletteJs));
check('command-palette.js open() does reflow-restart shim', /box\.style\.animation = 'none'; void box\.offsetWidth; box\.style\.animation = '';/.test(paletteJs));
check('command-palette.js open() resets staggerNext = true', /function open\(\) \{[\s\S]*?staggerNext = true;/.test(paletteJs));
check('command-palette.js close() resets staggerNext = true', /function close\(\) \{[\s\S]*?staggerNext = true;/.test(paletteJs));
check('command-palette.js render() gates stagger + clears flag', /const stagger = staggerNext && !prefersReducedMotion\(\);\s*\n\s*staggerNext = false;/.test(paletteJs));
check('command-palette.js result item markup conditionally adds --enter class', /domshell-palette-item\$\{stagger \? ' domshell-palette-item--enter' : ''\}/.test(paletteJs));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
