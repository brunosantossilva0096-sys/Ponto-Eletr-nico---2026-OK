import {
  ALL_WEEKDAYS,
  MtePolicyConfig,
  resolveShiftForEmployeeInWeek,
  ScheduleEmployeeConfig,
  SolverOptions,
  WEEKDAY_SHORT,
  WeekAssignment,
  WeekRange,
} from './scheduleSolver5x2';

export function printScheduleWeekHtml(params: {
  week: WeekRange;
  assignment: WeekAssignment;
  employees: ScheduleEmployeeConfig[];
  policy: MtePolicyConfig;
  solverOptions: SolverOptions;
  companyName: string;
  companyCnpj?: string;
  titlePrefix?: string;
}) {
  const {
    week,
    assignment,
    employees,
    policy,
    solverOptions,
    companyName,
    companyCnpj,
    titlePrefix = 'Escala 5x2 Vigente',
  } = params;

  const win = window.open('', '_blank', 'width=1050,height=720');
  if (!win) {
    alert('Permita pop-ups no navegador para abrir a tela de impressão.');
    return;
  }

  const rowsHtml = employees
    .map((emp) => {
      const offDay = assignment.offDayByEmployee[emp.id];
      const s = resolveShiftForEmployeeInWeek(
        emp,
        assignment.legalMaxWeeklyHours,
        assignment.appliedShift,
        policy,
        offDay,
        solverOptions
      );
      const satOff =
        offDay === 6 ||
        emp.offMode === 'mon_fri' ||
        !s.saturdayStart ||
        !s.saturdayEnd ||
        s.saturdayStart === s.saturdayEnd;

      const weekdayCells = ALL_WEEKDAYS.map((d) => {
        if (offDay === d) {
          return `<td class="folga">FOLGA</td>`;
        }
        return `<td><div>${s.workStart}–${s.workEnd}</div><div class="sub">Int. ${s.breakStart}–${s.breakEnd}</div></td>`;
      }).join('');

      const satCell = satOff
        ? `<td class="folga">FOLGA</td>`
        : `<td><div>${s.saturdayStart}–${s.saturdayEnd}</div>${
            s.saturdayBreakStart && s.saturdayBreakEnd
              ? `<div class="sub">Int. ${s.saturdayBreakStart}–${s.saturdayBreakEnd}</div>`
              : ''
          }</td>`;

      return `
        <tr>
          <td class="name">${emp.name}</td>
          <td class="center">${emp.group}</td>
          ${weekdayCells}
          ${satCell}
          <td class="dsr">DSR</td>
        </tr>
      `;
    })
    .join('');

  const headersHtml = ALL_WEEKDAYS.map((d) => {
    const iso = week.datesByDow[d] || '';
    return `<th>${WEEKDAY_SHORT[d]}<br/><span class="sub">${iso.slice(8, 10)}/${iso.slice(5, 7)}</span></th>`;
  }).join('');

  const satIso = week.datesByDow[6] || '';
  const sunIso = week.datesByDow[0] || '';

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${titlePrefix} — ${week.label}</title>
  <style>
    @page { size: landscape; margin: 12mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; margin: 0; padding: 16px; }
    .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #0f766e; padding-bottom: 8px; margin-bottom: 14px; }
    h1 { font-size: 18px; margin: 0 0 4px 0; color: #0f172a; }
    .meta { font-size: 12px; color: #475569; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 7px 6px; text-align: center; }
    th { background: #1e3a5f; color: #ffffff; font-weight: bold; }
    td.name { text-align: left; font-weight: bold; }
    td.folga { background: #d1fae5; color: #065f46; font-weight: bold; }
    td.dsr { background: #fef3c7; color: #92400e; font-weight: bold; }
    .sub { font-size: 10px; opacity: 0.8; }
    .footer { margin-top: 12px; font-size: 11px; color: #64748b; display: flex; justify-content: space-between; }
    @media print { .no-print { display: none; } body { padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${titlePrefix} — ${week.label}</h1>
      <div class="meta">
        <strong>Empresa:</strong> ${companyName}${companyCnpj ? ` • CNPJ: ${companyCnpj}` : ''} •
        <strong>Limite Semanal:</strong> ${assignment.legalMaxWeeklyHours}h/sem
      </div>
    </div>
    <button class="no-print" onclick="window.print()" style="padding:8px 14px;background:#0f766e;color:#fff;border:none;border-radius:6px;font-weight:bold;cursor:pointer;">
      Imprimir Agora
    </button>
  </div>
  <table>
    <thead>
      <tr>
        <th style="text-align:left;">Colaborador</th>
        <th>Grupo</th>
        ${headersHtml}
        <th>Sáb<br/><span class="sub">${satIso.slice(8, 10)}/${satIso.slice(5, 7)}</span></th>
        <th>Dom<br/><span class="sub">${sunIso.slice(8, 10)}/${sunIso.slice(5, 7)}</span></th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
  <div class="footer">
    <span>Emitido em ${new Date().toLocaleString('pt-BR')}</span>
    <span>Sistema Ponto Eletrônico Digital — Escala 5x2</span>
  </div>
  <script>window.onload = function() { setTimeout(function() { window.print(); }, 250); };</script>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
}
