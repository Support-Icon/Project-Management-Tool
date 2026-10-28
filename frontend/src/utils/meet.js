export const MEET_LANGS = [
  { id: 'en', label: 'English' },
  { id: 'ta', label: 'தமிழ் (Tamil)' },
  { id: 'hi', label: 'हिन्दी (Hindi)' },
  { id: 'te', label: 'తెలుగు (Telugu)' },
  { id: 'kn', label: 'ಕನ್ನಡ (Kannada)' },
  { id: 'ml', label: 'മലയാളം (Malayalam)' },
  { id: 'es', label: 'Español' },
  { id: 'fr', label: 'Français' },
  { id: 'ar', label: 'العربية' },
];

const STR = {
  en: {
    connecting: 'Connecting…',
    inCall: 'in call',
    you: 'You',
    muted: 'muted',
    notes: 'Notes',
    addNote: 'Add a note for the summary…',
    leave: 'Leave',
    end: 'End + summary',
    pin: 'Pin',
    unpin: 'Unpin',
    fullscreen: 'Full screen',
    raise: 'Raise hand',
    lower: 'Lower hand',
    share: 'Share screen',
    invite: 'Copy invite',
    copied: 'Invite copied',
    language: 'Language',
    guest: 'Guest',
    speaking: 'Speaking',
  },
  ta: {
    connecting: 'இணைக்கிறது…',
    inCall: 'அழையில்',
    you: 'நீங்கள்',
    muted: 'ஒலி அடக்கப்பட்டது',
    notes: 'குறிப்புகள்',
    addNote: 'சுருக்கத்திற்கான குறிப்பு…',
    leave: 'வெளியேறு',
    end: 'முடி + சுருக்கம்',
    pin: 'பின்',
    unpin: 'பின் நீக்கு',
    fullscreen: 'முழு திரை',
    raise: 'கை உயர்த்து',
    lower: 'கை இறக்கு',
    share: 'திரை பகிர்',
    invite: 'அழைப்பை நகலெடு',
    copied: 'நகலெடுக்கப்பட்டது',
    language: 'மொழி',
    guest: 'விருந்தினர்',
    speaking: 'பேசுகிறார்',
  },
  hi: {
    connecting: 'कनेक्ट हो रहा है…',
    inCall: 'कॉल में',
    you: 'आप',
    muted: 'म्यूट',
    notes: 'नोट्स',
    addNote: 'सारांश के लिए नोट लिखें…',
    leave: 'छोड़ें',
    end: 'समाप्त + सारांश',
    pin: 'पिन',
    unpin: 'अनपिन',
    fullscreen: 'फुल स्क्रीन',
    raise: 'हाथ उठाएँ',
    lower: 'हाथ नीचे',
    share: 'स्क्रीन शेयर',
    invite: 'लिंक कॉपी करें',
    copied: 'कॉपी हो गया',
    language: 'भाषा',
    guest: 'अतिथि',
    speaking: 'बोल रहे हैं',
  },
};

export const meetT = (lang, key) => (STR[lang] || STR.en)[key] || STR.en[key] || key;

export const REACTIONS = ['👍', '👏', '❤️', '😂', '🎉', '👋'];

export const meetingJoinUrl = (guestToken) => {
  if (!guestToken) return '';
  const base = String(import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  return `${window.location.origin}${base}/join/${guestToken}`;
};

export const meetingInviteText = (title, guestToken) => {
  const url = meetingJoinUrl(guestToken);
  return [
    'You are invited to a Supporticon meeting.',
    '',
    `Meeting: ${title || 'Team meeting'}`,
    '',
    'Join with this link (this meeting only — it does not open the rest of the app):',
    url,
    '',
    'Enter your name on the page, allow camera and mic, then you are in.'
  ].join('\n');
};

export const cleanSummaryText = (text) => String(text || '')
  .replace(/\*\*(.*?)\*\*/g, '$1')
  .replace(/__(.*?)__/g, '$1')
  .replace(/\*(.*?)\*/g, '$1')
  .replace(/^#{1,6}\s*/gm, '')
  .replace(/`{1,3}/g, '')
  .trim();
