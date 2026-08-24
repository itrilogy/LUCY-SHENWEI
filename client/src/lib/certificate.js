export function printCertificate({
    userName,
    department,
    examName,
    score,
    paperTotal,
    grade,
    date
}) {
    const when = date ? new Date(date) : new Date();
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>合格证 · ${userName || ''}</title>
<style>
  @page { size: A4 landscape; margin: 16mm; }
  body { font-family: "Songti SC", "SimSun", serif; color: #1e293b; }
  .sheet { border: 10px solid #4338ca; padding: 36px 48px; min-height: 520px; position: relative; }
  .inner { border: 2px solid #a5b4fc; padding: 32px 40px; min-height: 460px; text-align: center; }
  h1 { letter-spacing: .4em; font-size: 28px; margin: 8px 0 4px; color: #312e81; }
  .sub { color: #64748b; font-size: 13px; margin-bottom: 28px; }
  .name { font-size: 36px; font-weight: 900; margin: 20px 0 8px; }
  .line { width: 240px; border-bottom: 1px solid #cbd5e1; margin: 0 auto 20px; }
  p { font-size: 16px; line-height: 1.8; }
  .score { font-size: 22px; color: #4338ca; font-weight: 800; }
  .foot { display: flex; justify-content: space-between; margin-top: 48px; font-size: 13px; color: #475569; }
  .seal { width: 88px; height: 88px; border: 3px solid #dc2626; border-radius: 50%; color: #dc2626;
          display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;
          transform: rotate(-12deg); opacity: .85; }
</style>
</head>
<body>
  <div class="sheet"><div class="inner">
    <div class="sub">审微安全隐患识别培训系统 · 鹿溪联合创新实验室</div>
    <h1>培 训 合 格 证</h1>
    <div class="name">${escapeHtml(userName || '学员')}</div>
    <div class="line"></div>
    <p>参加「${escapeHtml(examName || '安全隐患识别考核')}」</p>
    <p>成绩 <span class="score">${score} / ${paperTotal}</span>　等第 <span class="score">${escapeHtml(grade || '')}</span></p>
    <p>达到合格标准，特发此证。</p>
    <div class="foot">
      <div>部门：${escapeHtml(department || '—')}</div>
      <div class="seal">合格<br/>Certified</div>
      <div>日期：${when.toLocaleDateString('zh-CN')}</div>
    </div>
  </div></div>
  <script>window.onload = function () { window.print(); }</script>
</body>
</html>`;
    const w = window.open('', '_blank', 'noopener,noreferrer');
    if (!w) return false;
    w.document.write(html);
    w.document.close();
    return true;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
