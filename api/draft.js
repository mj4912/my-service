// 답장 초안을 만들어 주는 작은 중계 프로그램 (Vercel 서버에서만 돕니다)
//
// 열쇠(GEMINI_API_KEY)는 이 파일 안이 아니라 서버에 보관된 값을 읽어 씁니다.
// 화면 소스에는 열쇠가 전혀 나타나지 않습니다.
//
// 공식 문서 기준 (ai.google.dev/gemini-api/docs/text-generation)
//   POST https://generativelanguage.googleapis.com/v1beta/interactions
//   헤더 x-goog-api-key
//   본문 { model, system_instruction, input, generation_config }
//   답  { output_text, steps:[{ type:"model_output", content:[{ type:"text", text }] }] }

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
// 앞의 것부터 씁니다. 그 모델이 붐비면(429·500·503) 다음 것으로 넘어갑니다.
const MODELS = ["gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.8-flash"];
const BUSY = [429, 500, 503];

const RULES = `당신은 교육과정을 운영하는 담당자입니다. 강사님께 보낼 회신 메일 초안을 한국어로 씁니다.

지켜야 할 것
- 전체 다섯 줄 안쪽으로 짧게 씁니다. 빈 줄은 세지 않습니다.
- 대화 내역의 맨 마지막은 강사님이 보내신 메일입니다. 거기 담긴 질문이나 요청에 반드시 답하는 내용을 담습니다.
- 알 수 없는 사실(주차 가능 여부, 강의장 사양, 수강생 수 등)은 지어내지 않습니다.
  대신 "확인 후 바로 안내드리겠습니다"처럼 확인해서 알려드리겠다고 씁니다.
- 첫 줄과 마지막 줄은 아래에서 지정해 드립니다. 글자 하나 바꾸지 말고 그대로 씁니다.
- 그대로 복사해 메일에 붙여넣을 수 있게, 설명이나 머리말 없이 메일 본문만 씁니다.
- 정중한 존댓말을 씁니다.`;

// 화면에서 온 값을 안전한 길이로 다듬기
const clean = (v, max) => String(v == null ? "" : v).slice(0, max);

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "잘못된 요청 방식입니다." });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return res.status(500).json({
      error: "서버에 열쇠(GEMINI_API_KEY)가 설정되어 있지 않습니다."
    });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  if (!body || !body.name || !Array.isArray(body.mails) || body.mails.length === 0) {
    return res.status(400).json({ error: "강사님 정보나 메일 내역이 넘어오지 않았습니다." });
  }

  const who =
    `강사님 성함 : ${clean(body.name, 40)}\n` +
    `역할 : ${clean(body.role, 20)}\n` +
    `맡으신 모듈 : ${clean(body.module, 80)}\n` +
    `일정 : ${clean(body.date, 60)}\n` +
    `장소 : ${clean(body.place, 80)}\n` +
    `진행 상태 : ${clean(body.status, 20)}`;

  const talk = body.mails.slice(0, 12).map((m) => {
    const who2 = m && m.from === "나" ? "교육운영팀(나)" : "강사님";
    return `[${who2} · ${clean(m && m.date, 20)}]\n${clean(m && m.text, 1200)}`;
  }).join("\n\n");

  // 인사말과 맺음말은 서버가 정해 그대로 쓰게 합니다 (이름이 빠지는 것을 막습니다)
  const hello = `안녕하세요, ${clean(body.name, 40)} ${clean(body.role, 20)}님.`;
  const bye = "알고링크 전미정 드림";

  const input =
    `아래는 한 강사님의 정보와, 그분과 주고받은 메일 전부입니다.\n` +
    `맨 마지막 강사님 메일에 대한 답장 초안을 써 주세요.\n\n` +
    `첫 줄은 반드시 이 문장 그대로 씁니다 : ${hello}\n` +
    `마지막 줄은 반드시 이 문장 그대로 씁니다 : ${bye}\n` +
    `그 사이에 본문을 세 줄 안쪽으로 씁니다.\n\n` +
    `--- 강사님 정보 ---\n${who}\n\n` +
    `--- 주고받은 메일 (오래된 것부터) ---\n${talk}`;

  let answer = null;
  let raw = "";
  for (const model of MODELS) {
    try {
      answer = await fetch(GEMINI_URL, {
        method: "POST",
        headers: {
          "x-goog-api-key": key,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          system_instruction: RULES,
          input,
          generation_config: { temperature: 0.4 }
        })
      });
    } catch (e) {
      return res.status(502).json({ error: "AI 서버에 연결하지 못했습니다." });
    }

    raw = await answer.text();
    if (answer.ok) break;
    // 붐비는 경우에만 다음 모델로 넘어갑니다
    if (!BUSY.includes(answer.status)) break;
  }

  if (!answer.ok) {
    // 구글이 보낸 설명을 한 줄만 옮깁니다 (열쇠는 담기지 않습니다)
    let why = "";
    try { why = JSON.parse(raw).error.message; } catch (e) { why = ""; }
    return res.status(502).json({
      error: `AI 호출이 거절되었습니다 (${answer.status})${why ? " — " + why.slice(0, 120) : ""}`
    });
  }

  let data;
  try { data = JSON.parse(raw); } catch (e) {
    return res.status(502).json({ error: "AI 응답을 읽지 못했습니다." });
  }

  // output_text 가 있으면 그대로, 없으면 model_output 단계에서 글을 모읍니다
  let draft = typeof data.output_text === "string" ? data.output_text : "";
  if (!draft && Array.isArray(data.steps)) {
    draft = data.steps
      .filter((s) => s && s.type === "model_output" && Array.isArray(s.content))
      .flatMap((s) => s.content)
      .filter((c) => c && c.type === "text" && typeof c.text === "string")
      .map((c) => c.text)
      .join("\n");
  }

  draft = draft.trim();
  if (!draft) {
    return res.status(502).json({ error: "AI가 빈 답을 보냈습니다. 다시 눌러 주세요." });
  }

  return res.status(200).json({ draft });
};
