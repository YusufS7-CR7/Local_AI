/**
 * Intelligent Natural Language Query and Command Sanitizer.
 * Extracts pure topics/queries from verbose Russian and English spoken commands,
 * stripping filler words, UI instructions ("open new tab in chrome"), and action verbs.
 */

const FILLER_PREFIXES = [
  /^\s*(?:джарвис|jarvis|эй\s+джарвис|слушай|пожалуйста|пж|привет|давай|можешь|нужно|надо|хочу)\s*[,:\s-]*/i,
  /^(?:открой|запусти|перейди|зайди|открыть)\s+(?:в\s+|на\s+)?(?:новое\s+|новую\s+)?(?:окно\s+|вкладку\s+)?(?:в\s+|на\s+)?(?:хроме|chrome|браузере|гугле|google|ютубе|youtube|яндексе|яндекс)\s*/i,
  /^(?:открой|запусти|перейди|зайди|открыть)\s+(?:в\s+|на\s+)?(?:хром|chrome|браузер|гугл|google|ютуб|youtube|яндекс)\s*/i,
  /^(?:зайди|перейди)\s+(?:в\s+|на\s+)?(?:ютуб|youtube|хром|chrome|гугл|google)\s*/i,
  /^(?:в\s+|на\s+)?(?:хроме|chrome|браузере|ютубе|youtube|гугле|google)\s*/i,
  /^(?:и\s+)?(?:найди|поищи|ищи|поиск|поискать|забей|пробей|посмотри|глянь)\s+(?:там\s+|мне\s+|нам\s+|в\s+интернете\s+|в\s+сети\s+)?/i,
  /^(?:информацию|инфу|сведения|данные|статью|пост)\s+(?:про\s+|о\s+|об\s+|насчет\s+|насчёт\s+|по\s+теме\s+)?/i,
];

const FILLER_POSTFIXES = [
  /\s+(?:и\s+)?(?:запусти|включи|поставь|открой|покажи|проиграй|воспроизведи|послушай)(?:\s+(?:этот|эту|его|ее|их)?\s*(?:ролик|видео|видеоролик|трек|песню|песни|плейлист|вкладку|окно|сайт|страницу)?)?\s*$/i,
  /\s+(?:в\s+|на\s+)?(?:хроме|chrome|браузере|ютубе|youtube|гугле|google)\s*$/i,
  /\s+(?:пожалуйста|быстро|сейчас|срочно)\s*$/i,
  /\s+и\s*$/i,
];

export function cleanSearchQuery(raw: string): string {
  if (!raw) return '';
  let query = raw.trim();

  // Strip leading punctuation
  query = query.replace(/^[!?.,;:"'«»\s]+|[!?.,;:"'«»\s]+$/g, '');

  // Extract explicit topic indicators first: "найди инфу про X" -> "X"
  const topicMatch = query.match(/(?:\bпро\b|\bоб\b|\bо\b|\bнасч[её]т\b|\bна тему\b|\bпо теме\b)\s+(.+)$/i);
  if (topicMatch?.[1]) {
    let extracted = topicMatch[1].trim();
    for (const post of FILLER_POSTFIXES) {
      extracted = extracted.replace(post, '');
    }
    extracted = extracted.replace(/^[!?.,;:"'«»\s]+|[!?.,;:"'«»\s]+$/g, '').trim();
    if (extracted.length >= 2) return extracted;
  }

  // Iteratively strip conversational prefixes
  let prev = '';
  while (prev !== query) {
    prev = query;
    for (const prefix of FILLER_PREFIXES) {
      query = query.replace(prefix, '').trim();
    }
  }

  // Iteratively strip conversational postfixes
  prev = '';
  while (prev !== query) {
    prev = query;
    for (const post of FILLER_POSTFIXES) {
      query = query.replace(post, '').trim();
    }
  }

  query = query.replace(/^[!?.,;:"'«»\s]+|[!?.,;:"'«»\s]+$/g, '').trim();

  return query || raw.trim();
}

export function cleanYouTubeQuery(raw: string): string {
  let query = cleanSearchQuery(raw);

  // Remove redundant YouTube words from the inner query
  query = query
    .replace(/(?:^|\s)(?:на\s+ютубе|в\s+ютубе|на\s+youtube|в\s+youtube|ютуб|youtube)(?=\s|$)/gi, ' ')
    .replace(/(?:^|\s)(?:видеоролик|ролик|видео)(?=\s|$)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return query || 'популярные видео';
}

export function cleanYouTubePlaylistQuery(raw: string): string {
  let query = cleanSearchQuery(raw);

  // Remove conversational phrasing around playlists
  query = query
    .replace(/(?:^|\s)(?:на\s+ютубе|в\s+ютубе|на\s+youtube|в\s+youtube|ютуб|youtube)(?=\s|$)/gi, ' ')
    .replace(/(?:^|\s)(?:плейлист|плейлиста|плейлисты|playlist)(?:\s+(?:из|про|с|на тему))?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return query || 'грустные песни';
}

