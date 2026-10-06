// English levels for building a starting word list: the words of the
// `learn` lists minus those the learner already knows (`known` lists).
// Plain script, used by background.js, level.html and tests.
const LexiBridgeLevels = (() => {
  const LB = typeof LexiBridge !== 'undefined' ? LexiBridge : require('./lexicon.js');

  // Function words every level knows. The CET4 list contains them, so
  // without this the entry level would highlight "the" and "will".
  const COMMON_WORDS = new Set(`
    a an the this that these those some any each every no all both either neither
    many much more most few little other another such what which whose
    i me my mine myself you your yours yourself he him his himself she her hers
    herself it its itself we us our ours ourselves they them their theirs themselves
    who whom one
    about above across after against along among around as at before behind below
    beside between beyond but by down during except for from in inside into like
    near of off on onto out outside over past since through till to toward towards
    under until up upon with within without
    and or nor so yet because if unless while when where whether than though
    although once
    be am is are was were been being have has had having do does did done
    can could may might must shall should will would
    not very too also just only even still already again ever never always often
    here there now then how why yes well
    two three four five six seven eight nine ten hundred thousand first second
  `.trim().split(/\s+/));

  const LEVELS = [
    {id: 'basic', name: '入门', known: [], learn: ['CET4_edited', 'CET6_edited'],
     knownLabel: '常用功能词（the、will 等）', learnLabel: '四级 + 六级词汇'},
    {id: 'cet4', name: '大学四级', known: ['CET4_edited'], learn: ['CET6_edited'],
     knownLabel: '四级词汇', learnLabel: '六级词汇'},
    {id: 'cet6', name: '大学六级', known: ['CET4_edited', 'CET6_edited'], learn: ['GRE_abridged'],
     knownLabel: '四级 + 六级词汇', learnLabel: 'GRE 核心词汇'},
    {id: 'gre', name: 'GRE 核心', known: ['CET4_edited', 'CET6_edited', 'GRE_abridged'], learn: ['GRE_8000_Words'],
     knownLabel: '四六级 + GRE 核心词汇', learnLabel: 'GRE 进阶词汇'},
  ];
  const DEFAULT_LEVEL = 'cet4';

  function getLevel(id) {
    return LEVELS.find(l => l.id === id);
  }

  // Word list names a level needs.
  function listsFor(level) {
    return [...new Set([...level.known, ...level.learn])];
  }

  // lists: {name: [["word", "definition"], ...]} -> word list rows
  function levelWords(level, lists) {
    const known = LB.buildDictionary(level.known.flatMap(n => lists[n]));
    const learn = LB.buildDictionary(level.learn.flatMap(n => lists[n]));
    return [...learn].filter(([word]) => !known.has(word) && !COMMON_WORDS.has(word));
  }

  // Fetches bundled word lists by name (extension pages and service worker).
  async function loadLists(names) {
    const lists = {};
    for(const name of names) {
      const res = await fetch(chrome.runtime.getURL(`words/${name}.json`));
      lists[name] = await res.json();
    }
    return lists;
  }

  return {COMMON_WORDS, LEVELS, DEFAULT_LEVEL, getLevel, listsFor, levelWords, loadLists};
})();

if (typeof module !== 'undefined') module.exports = LexiBridgeLevels;
