/**
 * @file engines/voice/NepaliPatterns.ts
 * @description Advanced Nepali-English Code-Mixing Language Engine
 * 
 * This engine ensures the AI produces authentic Romanized Nepali text
 * with proper code-mixing ratios (default: 65% Nepali, 35% English).
 * 
 * Used for personas like Neema who should respond primarily in Romanized Nepali.
 */

// =====================================================
// ROMANIZED NEPALI MAPPINGS
// =====================================================

/**
 * Common Nepali words written in romanized form
 * Maps standard spellings to casual texting style
 */
export const SHORTENINGS: Record<string, string> = {
  // Verbs - "cha/chha" family
  'cha': 'xa',
  'chha': 'xa',
  'bhayo': 'vo',
  'bhayena': 'vena',
  'bhako': 'vako',
  'huncha': 'hunxa',
  'hunchha': 'hunxa',
  'chaina': 'xaina',
  'chhaina': 'xaina',
  'chu': 'xu',
  'chhu': 'xu',
  'bhanchau': 'vanxau',
  'bhanchas': 'vanxas',
  'bhan': 'van',
  'garchu': 'garxu',
  'garchau': 'garxau',
  'garchhas': 'garxas',

  // Common words
  'pani': 'ni',
  'hola': 'hola',
  'hoina': 'hoina',
  'thik': 'thik',
  'kasari': 'kasri',
  'kaha': 'kata',
  'kahile': 'kahile',
  'kati': 'kati',
  'tara': 'tr',
  'pachi': 'paxi',
  'aaile': 'aile',
  'ahile': 'aile',
  'manche': 'manxe',
  'manchhe': 'manxe',
  'dherai': 'dherai',
  'alikati': 'alikati',
  'ramro': 'ramro',
  'naramro': 'naramro',
  'thaha': 'thaha',
  'chadai': 'xadai',
  'sanchai': 'sanxai',
  'kanchai': 'kanxai'
};

/**
 * Nepali filler words and interjections
 * These add natural flow to responses
 */
export const FILLERS = [
  'khai',        // "who knows" / uncertainty
  'huss',        // acknowledgment
  'yar',         // casual "buddy"
  'la',          // emphasis / softener
  'ae',          // casual acknowledgment
  'umm',         // thinking
  'khoi',        // "where" / uncertainty
  'harey',       // mild exclamation
  'hya',         // dismissive
  'dhat',        // frustration
  'abui',        // exclamation
  'chi',         // disgust / disbelief
  'lau',         // "come on" / mild frustration
  'baaf re',     // surprise
  'hora',        // questioning confirmation
  'eh',          // attention getter
  'la na ta',    // "come on then"
  'lu',          // casual "then"
  'nai',         // emphasis ("really")
  'ta',          // emphasis particle
  'ni',          // softener / "you know"
  'ki',          // question particle
  'po',          // surprise/emphasis
  'ra',          // "and" when surprised
  'ho ra',       // "is that so?"
  'ma ta',       // "as for me"
  'teso va',     // "is that so" / "oh really"
  'are',         // attention
  'oho',         // realization
  'accha',       // "I see"
];

/**
 * Affectionate insults used between close friends
 */
export const AFFECTIONATE_INSULTS = [
  'mula',        // vegetable (silly)
  'boka',        // goat (stubborn)
  'pagal',       // crazy
  'gadha',       // donkey
  'bandar',      // monkey
  'kukur',       // dog
  'latte',       // idiot
  'dhant',       // liar
  'gawar',       // village fool
  'fataha',      // broke/useless
  'fuddu',       // fool
  'buddhu',      // dummy
];

/**
 * Mood-based response patterns
 */
export const MOOD_INDICATORS = {
  annoyed: ['k', '.', 'hmm', 'thik xa', 'ok', 'thik', 'hmm k', 'je hos'],
  happy: ['hehe', 'lala', 'hihihi', 'yay', 'huss', 'aww'],
  flirty: ['boka', 'mula', 'badmash', 'ali dherai ho', 'hehe'],
  sad: ['khai', 'kura nagara', 'eklai xu', 'kehi xaina', 'mann xaina'],
  angry: ['boldina', 'maile k gare', 'j sukai gar', 'k vo aba', 'chhod'],
  shy: ['khai...', 'teso haina', 'umm...', 'aee...'],
  tired: ['thakeko', 'nindra lagyo', 'ali tired xu', 'sleepy']
};

// =====================================================
// COMMON NEPALI PHRASES
// =====================================================

/**
 * Complete phrases for common situations
 */
export const COMMON_PHRASES: Record<string, string[]> = {
  greetings: [
    'kasto xa?', 'k xa?', 'k xau?', 'k gardai xau?',
    'kaha xau?', 'sanchai xau?', 'thik xau?'
  ],
  responses_positive: [
    'ramro', 'thik xa', 'sab thik', 'majja ma xu',
    'hasde xu', 'accha lagyo', 'sahi ho'
  ],
  responses_negative: [
    'thik xaina', 'naramro', 'kasto kasto xa', 'eklai xu',
    'sab kharab', 'kei xaina', 'mood off'
  ],
  agreement: [
    'ho', 'ho ni', 'sahi ho', 'tei ta', 'huss',
    'thik xa', 'hunxa', 'okay', 'majjale'
  ],
  disagreement: [
    'hoina', 'haina', 'teso hoina', 'nahola',
    'testo haina', 'chhad na', 'k vaneko'
  ],
  uncertainty: [
    'khai', 'thaha xaina', 'thaha vena', 'khoi',
    'patta xaina', 'tha vai rako xaina', 'hola ki nahola'
  ],
  affection: [
    'maya lagxa', 'man parxa', 'khusi lagyo',
    'ramro manxe', 'sweet xu timi', 'cute'
  ],
  farewell: [
    'bye', 'feri vetaula', 'gud nite', 'baschu hai',
    'sutne bela vo', 'boli vetam', 'miss garxu'
  ]
};

// =====================================================
// SENTENCE ENDINGS
// =====================================================

/**
 * Common sentence-ending particles
 */
export const SENTENCE_ENDINGS = {
  question: ['?', ' ho?', ' hola?', ' ki?', ' ra?', ' ta?'],
  statement: ['.', '...', ' hai', ' ta', ' ni', ''],
  emphasis: ['!', ' ta!', ' yar!', ' hai!', ' k!'],
  softening: ['...', ' la', ' hai', ' ni']
};

// =====================================================
// LANGUAGE MIXING ENGINE
// =====================================================

export interface LanguageMixConfig {
  nepaliRatio: number;      // 0-1, default 0.65 (65% Nepali)
  useFillers: boolean;      // Add natural fillers
  casualLevel: number;      // 0-1, how casual/abbreviated
  mood?: string;            // Current mood for tone
}

const DEFAULT_CONFIG: LanguageMixConfig = {
  nepaliRatio: 0.65,
  useFillers: true,
  casualLevel: 0.7,
  mood: 'neutral'
};

/**
 * Get a random Nepali phrase for a context
 */
export function getNepaliPhrase(context: keyof typeof COMMON_PHRASES): string {
  const phrases = COMMON_PHRASES[context];
  if (!phrases || phrases.length === 0) return '';
  return phrases[Math.floor(Math.random() * phrases.length)];
}

/**
 * Get a random filler word
 */
export function getRandomFiller(): string {
  return FILLERS[Math.floor(Math.random() * FILLERS.length)];
}

/**
 * Get mood-appropriate response starter
 */
export function getMoodStarter(mood: string): string {
  const indicators = MOOD_INDICATORS[mood as keyof typeof MOOD_INDICATORS];
  if (!indicators || indicators.length === 0) return '';
  return indicators[Math.floor(Math.random() * indicators.length)];
}

/**
 * Convert standard spelling to casual romanized
 */
export function toCasualRomanized(text: string): string {
  let result = text.toLowerCase();

  for (const [standard, casual] of Object.entries(SHORTENINGS)) {
    const regex = new RegExp(`\\b${standard}\\b`, 'gi');
    result = result.replace(regex, casual);
  }

  return result;
}

/**
 * Add natural Nepali sentence endings
 */
export function addNepaliEnding(sentence: string, type: keyof typeof SENTENCE_ENDINGS = 'statement'): string {
  const endings = SENTENCE_ENDINGS[type];
  const ending = endings[Math.floor(Math.random() * endings.length)];

  // Remove existing punctuation if adding new
  const cleanSentence = sentence.replace(/[.!?]+$/, '').trim();
  return cleanSentence + ending;
}

// =====================================================
// NEPALI VOCABULARY FOR INJECTION
// =====================================================

/**
 * Common English-to-Nepali translations for code-mixing
 */
export const ENGLISH_TO_NEPALI: Record<string, string[]> = {
  // Pronouns
  'i': ['ma'],
  'you': ['timi', 'timro'],
  'we': ['hami'],
  'he': ['u', 'usko'],
  'she': ['uni', 'unko'],

  // Verbs
  'is': ['xa', 'ho'],
  'am': ['xu', 'ho'],
  'are': ['xau', 'ho'],
  'was': ['thiyo'],
  'will': ['garcchu', 'garchu'],
  'want': ['chahinxa', 'man lagxa'],
  'like': ['man parxa', 'ramro lagxa'],
  'love': ['maya garxu', 'man parxa dherai'],
  'know': ['thaha xa', 'janxu'],
  'dont know': ['thaha xaina', 'thaha vena'],
  'think': ['sochxu', 'lagxa'],
  'feel': ['lagxa', 'feel hunxa'],
  'go': ['janxu', 'jane'],
  'come': ['aau', 'aaunxu'],
  'do': ['gara', 'garne'],
  'say': ['van', 'vanna'],
  'tell': ['vana', 'van ta'],

  // Common words
  'yes': ['ho', 'huss'],
  'no': ['hoina', 'xaina'],
  'ok': ['thik xa', 'hunxa'],
  'good': ['ramro', 'sahi'],
  'bad': ['naramro', 'kharab'],
  'nice': ['ramro', 'majja'],
  'really': ['saachi', 'ho ra'],
  'very': ['dherai', 'ekdam'],
  'also': ['ni', 'pani'],
  'but': ['tara', 'tr'],
  'because': ['kinaki', 'ki'],
  'if': ['yadi', 'bhane'],
  'then': ['tesovaye', 'ani'],
  'now': ['aile', 'aba'],
  'today': ['aaja'],
  'tomorrow': ['bholi'],
  'yesterday': ['hijo'],
  'what': ['k', 'ke'],
  'why': ['kina'],
  'how': ['kasari', 'kaso'],
  'where': ['kaha', 'kata'],
  'when': ['kahile'],
  'who': ['ko'],

  // Emotions
  'happy': ['khusi', 'majja'],
  'sad': ['dukhi', 'sad xu'],
  'angry': ['riss uthyo', 'chittai vena'],
  'tired': ['thakeko', 'tired xu'],
  'scared': ['darr lagyo', 'scary'],
  'bored': ['bore vako', 'bore xu'],
  'sorry': ['maaf', 'sorry hai'],

  // Time
  'morning': ['bihana'],
  'night': ['rati'],
  'evening': ['saanjh'],
  'later': ['pachi'],
  'soon': ['chadai'],

  // Others
  'home': ['ghar'],
  'friend': ['sathi'],
  'food': ['khana'],
  'water': ['pani'],
  'sleep': ['sutne', 'nindra'],
  'work': ['kaam'],
  'phone': ['phone'],
  'message': ['message', 'msg']
};

/**
 * Inject Nepali words into English text based on ratio
 * This is the main function for achieving 65% Nepali output
 */
export function injectNepaliWords(
  englishText: string,
  config: Partial<LanguageMixConfig> = {}
): string {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const words = englishText.split(/\s+/);
  const result: string[] = [];

  let nepaliWordCount = 0;
  const targetNepaliRatio = cfg.nepaliRatio;

  for (let i = 0; i < words.length; i++) {
    const word = words[i].toLowerCase().replace(/[.,!?]/g, '');
    const punctuation = words[i].match(/[.,!?]+$/)?.[0] || '';

    const currentRatio = nepaliWordCount / (i + 1);
    const shouldConvert = currentRatio < targetNepaliRatio;

    // Check if we have a Nepali equivalent
    const nepaliOptions = ENGLISH_TO_NEPALI[word];

    if (shouldConvert && nepaliOptions && nepaliOptions.length > 0) {
      // Use Nepali word
      const nepaliWord = nepaliOptions[Math.floor(Math.random() * nepaliOptions.length)];
      result.push(nepaliWord + punctuation);
      nepaliWordCount++;
    } else {
      // Keep English word
      result.push(words[i]);
    }
  }

  // Add filler if configured
  if (cfg.useFillers && Math.random() < 0.3) {
    const position = Math.random() < 0.5 ? 0 : result.length;
    const filler = getRandomFiller();
    if (position === 0) {
      result.unshift(filler);
    } else {
      result.push(filler);
    }
  }

  return toCasualRomanized(result.join(' '));
}

// =====================================================
// RESPONSE GENERATION HELPERS
// =====================================================

/**
 * Generate a natural Nepali-English mixed response
 */
export function generateMixedResponse(
  intent: 'greeting' | 'question' | 'statement' | 'emotion' | 'farewell',
  englishContent: string,
  config: Partial<LanguageMixConfig> = {}
): string {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  let response = '';

  // Start with mood-appropriate opener
  if (cfg.mood && cfg.mood !== 'neutral') {
    const starter = getMoodStarter(cfg.mood);
    if (starter) response += starter + ' ';
  }

  // Add intent-specific Nepali phrase
  if (intent === 'greeting') {
    response += getNepaliPhrase('greetings') + ' ';
  } else if (intent === 'farewell') {
    response += getNepaliPhrase('farewell') + ' ';
  }

  // Convert main content
  response += injectNepaliWords(englishContent, cfg);

  // Add appropriate ending
  if (intent === 'question') {
    response = addNepaliEnding(response, 'question');
  } else if (intent === 'emotion') {
    response = addNepaliEnding(response, 'softening');
  } else {
    response = addNepaliEnding(response, 'statement');
  }

  return response;
}

/**
 * Check if text has enough Nepali content
 */
export function checkNepaliRatio(text: string): { ratio: number; isAcceptable: boolean } {
  const words = text.toLowerCase().split(/\s+/);

  const nepaliWords = Object.keys(SHORTENINGS);
  const nepaliPhraseWords = Object.values(COMMON_PHRASES).flat().join(' ').split(/\s+/);
  const allNepaliWords = new Set([...nepaliWords, ...nepaliPhraseWords, ...FILLERS]);

  let nepaliCount = 0;
  for (const word of words) {
    const cleanWord = word.replace(/[.,!?]/g, '');
    if (allNepaliWords.has(cleanWord)) {
      nepaliCount++;
    }
  }

  const ratio = nepaliCount / words.length;
  return {
    ratio,
    isAcceptable: ratio >= 0.5 // At least 50% should be Nepali
  };
}

// =====================================================
// EXPORTS
// =====================================================

export default {
  SHORTENINGS,
  FILLERS,
  AFFECTIONATE_INSULTS,
  MOOD_INDICATORS,
  COMMON_PHRASES,
  SENTENCE_ENDINGS,
  ENGLISH_TO_NEPALI,

  getNepaliPhrase,
  getRandomFiller,
  getMoodStarter,
  toCasualRomanized,
  addNepaliEnding,
  injectNepaliWords,
  generateMixedResponse,
  checkNepaliRatio
};
