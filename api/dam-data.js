// Vercel Serverless — 남강댐 방류현황 프록시
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const obscd = req.query.obscd || "2018110"; // 남강댐
  const fbscd = req.query.fbscd || "02";

  try {
    // 1차: 낙동강홍수통제소 팝업 페이지에서 파싱
    const url = `https://www.nakdongriver.go.kr/sumun/popup/damPopup.do?Fbscd=${fbscd}&Obscd=${obscd}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "text/html" }
    });
    const html = await response.text();

    // HTML에서 방류량 데이터 추출
    const result = { obscd, time: new Date().toISOString(), source: "nakdongriver.go.kr" };

    // 방류량 추출 패턴들
    const patterns = [
      // 총방류량
      { key: "totalDischarge", regex: /총\s*방류량[^0-9]*([0-9,.]+)\s*(㎥\/s|m³\/s|톤)/i },
      { key: "totalDischarge", regex: /총방류[^0-9]*([0-9,.]+)/i },
      // 방류량
      { key: "discharge", regex: /방류량[^0-9]*([0-9,.]+)\s*(㎥\/s|m³\/s)/i },
      { key: "discharge", regex: /방류[^총][^0-9]*([0-9,.]+)/i },
      // 수위
      { key: "waterLevel", regex: /수위[^0-9]*([0-9,.]+)\s*(m|EL\.m)/i },
      // 유입량
      { key: "inflow", regex: /유입량[^0-9]*([0-9,.]+)/i },
      // 저수율
      { key: "storageRate", regex: /저수율[^0-9]*([0-9,.]+)\s*%/i },
    ];

    patterns.forEach(p => {
      if (!result[p.key]) {
        const m = html.match(p.regex);
        if (m) result[p.key] = parseFloat(m[1].replace(/,/g, "")) || 0;
      }
    });

    // td 태그에서 숫자 추출 (테이블 구조일 경우)
    const tdValues = [];
    const tdRegex = /<td[^>]*>\s*([0-9,.]+)\s*<\/td>/gi;
    let match;
    while ((match = tdRegex.exec(html)) !== null) {
      tdValues.push(parseFloat(match[1].replace(/,/g, "")) || 0);
    }
    result.rawValues = tdValues.slice(0, 10);

    // 최소 하나의 값이 있으면 성공
    if (result.discharge || result.totalDischarge || tdValues.length > 0) {
      result.success = true;
      // discharge가 없으면 rawValues에서 추정
      if (!result.discharge && !result.totalDischarge && tdValues.length > 0) {
        result.discharge = tdValues[0]; // 첫 번째 값을 방류량으로 추정
      }
    } else {
      result.success = false;
      result.htmlLength = html.length;
      result.htmlPreview = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
    }

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}
