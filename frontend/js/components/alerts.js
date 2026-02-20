/**
 * Componente de feed de alertas
 */

export function renderAlerts(container, alerts) {
  if (!alerts.length) {
    container.innerHTML = '<div class="noalert">Nenhum alerta — ative o rastreamento nas wallets</div>';
    return;
  }

  container.innerHTML = alerts
    .map(
      (a, i) => {
        const isTrade = a.data && (a.type === 'buy' || a.type === 'sell');
        const analisarBtn = isTrade
          ? `<button type="button" class="af-btn-analyze" onclick="window.openTradeFromAlert(${i})" title="Ver trade e analisar">🤖 Analisar</button>`
          : '';
        return `
    <div class="afitem" role="status" aria-live="polite">
      <div class="afdot af${a.type}"></div>
      <div class="afbody">
        <div class="afname">${a.name}</div>
        <div class="afmsg">${a.msg}</div>
      </div>
      <div class="afright">
        ${analisarBtn}
        <div class="aftime">${a.t}</div>
      </div>
    </div>`;
      }
    )
    .join('');
}
