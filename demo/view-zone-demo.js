// Live diff playground: every edit accumulates against this chat's first snapshot.
// Deleted rows are visual only; saving this file never includes them.
const GREETINGS = {
  en: { hello: 'Great to see you', fallback: 'new friend' },
  es: { hello: 'Hola', fallback: 'amigo' },
  fr: { hello: 'Bonjour', fallback: 'mon ami' },
  it: { hello: 'Ciao', fallback: 'amico' },
  de: { hello: 'Hallo', fallback: 'Freund' },
  pt: { hello: 'Olá', fallback: 'amigo' },
  ja: { hello: 'こんにちは', fallback: 'ゲスト' },
  nl: { hello: 'Hallo', fallback: 'vriend' },
};

function normalizeName(name, fallback) {
  if (name == null) return fallback;
  if (typeof name !== 'string') {
    throw new TypeError(`Guest names must be text; received ${typeof name}.`);
  }

  return name.trim().replace(/\s+/g, ' ') || fallback;
}

function greet(name, { language = 'en', enthusiastic = false } = {}) {
  if (!Object.hasOwn(GREETINGS, language)) {
    const supported = Object.keys(GREETINGS).join(', ');
    throw new RangeError(`Unknown language "${language}". Try one of: ${supported}.`);
  }

  const { hello, fallback } = GREETINGS[language];
  const displayName = normalizeName(name, fallback);
  const punctuation = enthusiastic ? '! ✨' : '.';
  return `${hello}, ${displayName}${punctuation}`;
}

function createGreetingList(people, options = {}) {
  if (!Array.isArray(people)) {
    throw new TypeError('Expected an array of names.');
  }

  return people.map((name, index) => ({
    position: String(index + 1).padStart(2, '0'),
    message: greet(name, options),
  }));
}

const guests = ['  Michael  ', 'Ada   Lovelace', 'Grace Hopper', 'Alan Turing', '', null];
const examples = createGreetingList(guests, { enthusiastic: true });

console.log('════════ Community open day ════════');
console.log(`Preparing greetings for ${examples.length} guests.\n`);
for (const { position, message } of examples) {
  console.log(`${position}. ${message}`);
}

console.log('\nLanguage examples');
console.log(greet('Sofía', { language: 'es' }));
console.log(greet('Camille', { language: 'fr', enthusiastic: true }));
console.log(greet('Giulia', { language: 'it' }));
console.log(greet('Max', { language: 'de', enthusiastic: true }));
console.log(greet('Beatriz', { language: 'pt', enthusiastic: true }));
console.log(greet('Hana', { language: 'ja' }));
console.log(greet('Noor', { language: 'nl', enthusiastic: true }));

console.log(`\nAvailable languages: ${Object.keys(GREETINGS).join(', ')}`);
console.log(`Total greetings prepared: ${examples.length}`);
console.log('The welcome desk is open — enjoy your visit!');

try {
  greet(42);
} catch (error) {
  console.log(`Validation example: ${error.message}`);
}

const languageCount = Object.keys(GREETINGS).length;
console.log('\nSession summary');
console.log(`Guests: ${guests.length} | Languages: ${languageCount}`);
console.log('Demo update: reject and undo test');
console.log('Thanks for stopping by — see you next time!');
