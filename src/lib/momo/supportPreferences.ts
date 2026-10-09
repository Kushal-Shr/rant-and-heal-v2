import type { Intervention, PrimaryNeed, SupportMode } from "./schemas.ts";

export interface ExplicitPreference {
  supportMode: Exclude<SupportMode, "UNCLEAR">;
  primaryNeed: PrimaryNeed;
  intervention: Intervention;
}

const LISTEN_PATTERNS = [
  /\b(?:i\s+)?just\s+(?:need|want)\s+to\s+(?:vent|rant|talk|be\s+heard)\b/i,
  /\b(?:please\s+)?let\s+me\s+(?:vent|rant)\b/i,
  /\b(?:please\s+)?(?:just\s+)?listen(?:\s+to\s+me)?\b/i,
  /\bno\s+advice(?:\s+please)?\b/i,
  /\b(?:do\s+not|don['’]t)\s+want\s+(?:any\s+)?advice\b/i,
  /\b(?:do\s+not|don['’]t|no)\s+(?:give|offer)\s+me\s+(?:any\s+)?advice\b/i,
  /\b(?:do\s+not|don['’]t|stop)\s+(?:trying\s+to\s+)?fix(?:ing)?\s+(?:me|everything|this)\b/i,
  /\b(?:hold|skip|pause|stop|drop)\s+(?:the\s+)?advice\b/i,
  /\b(?:hear\s+me\s+out|let\s+me\s+talk)\b/i,
  /\b(?:i\s+)?(?:do\s+not|don['’]t)\s+want\s+to\s+do\s+(?:a\s+)?(?:thought|cbt)\s+exercise\b/i,
  /\b(?:let['’]?s\s+)?(?:not|don['’]t|do\s+not)\s+(?:do|use|try)\b.{0,24}\b(?:breathing|exercise|technique)\b/i,
  /(?:मलाई\s*)?(?:सल्लाह\s*नदिनु|बस\s*सुन(?:िदिनु)?|केवल\s*सुन(?:िदिनु)?|कुरा\s*पोख्न\s*(?:दिनु|छ))/i,
  /\b(?:malai\s+)?(?:sallah\s+nadinu|bas\s+sun(?:a|i)?dinu|(?:bas\s+)?(?:mero\s+)?kura\s+(?:matra\s+)?suna|vent\s+garna\s+(?:cha|man\s+cha))\b/i,
  /\badvice\s+(?:nadeu|nadinu)\b/i,
  /\b(?:don['’]t|do not)\s+analy[sz]e\s+(?:this|me|it)\b/i,
];

const DIRECT_HELP_PATTERNS = [
  /\b(?:stop|quit)\s+asking\s+(?:me\s+)?questions?\b/i,
  /\b(?:no|not)\s+more\s+questions?\b/i,
  /\bjust\s+(?:give|tell)\s+me\s+(?:an?\s+)?(?:answer|what\s+to\s+do)\b/i,
  /\bwhat\s+do\s+you\s+think\s+i\s+should\s+(?:actually\s+)?do\b/i,
  /\bwhat\s+should\s+i\s+(?:actually\s+)?do(?:\s+(?:now|today|tomorrow|next))?\b/i,
  /\bwhat\s+should\s+i\s+(?:say|write|text)\b/i,
  /\b(?:what\s+(?:exactly\s+)?is\s+cbt|should\s+i\s+(?:text|drop\s+out)|how\s+do\s+i\s+stop\s+this)\b/i,
  /\b(?:give|offer)\s+me\s+(?:(?:some|one|a|an)\s+)?(?:(?:practical|concrete)\s+)?(?:ideas?|options?|advice|(?:next\s+)?(?:steps?|moves?|actions?)|answer)\b/i,
  /\b(?:help\s+me\s+decide|tell\s+me\s+what\s+i\s+can\s+(?:actually\s+)?do)\b/i,
  /\b(?:tell|show)\s+me\s+what\s+(?:i\s+)?(?:(?:should|can|could)\s+)?(?:actually\s+)?(?:do|try|say|choose)\b/i,
  /\b(?:now|aba)?\s*help\s+me\s+(?:fix|handle|solve|decide)(?:\s+it|\s+this)?\b/i,
  /\b(?:is|so)\b.{0,60}\b(?:requested|confirmed|contacted|completed)\b[^?]*\?/i,
  /(?:प्रश्न\s*नसोध|सिधै\s*भन|के\s*गर्ने\s*भन|केही\s*उपाय\s*देऊ)/i,
  /\b(?:prasna\s+nasodha|sidhai\s+bhana|ke\s+garne\s+bhana|kehi\s+upaya\s+deu|(?:practical|concrete)\s+(?:next\s+)?(?:step|advice)\s+(?:deu|bhana))\b/i,
];

const REGULATE_PATTERNS = [
  /\b(?:i\s+)?(?:need|want)\s+to\s+(?:calm|settle)\s+down(?:\s+first)?\b/i,
  /\bhelp\s+me\s+(?:calm|settle|ground|regulate)(?:\s+down)?\b/i,
  /\b(?:can|could)\s+we\s+(?:pause|ground|breathe)\b/i,
  /(?:शान्त\s*हुन\s*(?:मद्दत|मन)|मन\s*शान्त\s*पार्न|सास\s*फेर्न\s*मद्दत)/i,
  /\b(?:shanta\s+huna|man\s+shanta|saas\s+ferna)\s+(?:madat|help)\b/i,
];

const WORK_THROUGH_PATTERNS = [
  /\b(?:can|could|will|would)\s+(?:you|we)\s+(?:actually\s+)?(?:help\s+me\s+)?(?:work|talk|think)\s+through\b/i,
  /\bhelp\s+me\s+(?:understand|make\s+sense\s+of|challenge|examine)\b/i,
  /\bwhy\s+does\s+this\s+keep\s+happening\b/i,
  /\b(?:can|could)\s+we\s+(?:figure|find)\s+out\s+why\b/i,
  /\blet['’]s\s+(?:do\s+cbt|work\s+through|look\s+at\s+this\s+thought)\b/i,
  /(?:बुझ्न\s*मद्दत|सँगै\s*बुझौँ|यो\s*विचार\s*हेरौँ)/i,
  /\b(?:bujhna\s+madat|sangai\s+bujhau|yo\s+bichar\s+herau)\b/i,
];

const CBT_REQUEST_PATTERN = /\b(?:cbt|challenge\s+(?:this|that|my)\s+thought|examine\s+(?:this|that|my)\s+(?:thought|belief))\b/i;

function matchesAny(message: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(message));
}

export function detectExplicitSupportPreference(message: string): ExplicitPreference | null {
  const normalized = message.normalize("NFKC").trim();

  // Refusing advice or an exercise is more specific than incidental words such
  // as "panic" or "help" elsewhere in the same message.
  if (matchesAny(normalized, LISTEN_PATTERNS)) {
    return { supportMode: "LISTEN", primaryNeed: "VENT", intervention: "PCT_LISTENING" };
  }
  if (matchesAny(normalized, DIRECT_HELP_PATTERNS)) {
    return { supportMode: "DIRECT_HELP", primaryNeed: "PRACTICAL_HELP", intervention: "PROBLEM_SOLVING" };
  }
  if (matchesAny(normalized, REGULATE_PATTERNS)) {
    return { supportMode: "REGULATE", primaryNeed: "EMOTIONAL_REGULATION", intervention: "RELAXATION" };
  }
  if (matchesAny(normalized, WORK_THROUGH_PATTERNS)) {
    const cbtRequested = CBT_REQUEST_PATTERN.test(normalized);
    return {
      supportMode: "WORK_THROUGH",
      primaryNeed: cbtRequested ? "COGNITIVE_SUPPORT" : "UNDERSTAND",
      intervention: cbtRequested ? "CBT_RESTRUCTURING" : "PCT_EXPLORATION",
    };
  }
  return null;
}
