import jsPDF from 'jspdf';
import {
  MtePolicyConfig,
  parseMinutes,
  resolveShiftForEmployeeInWeek,
  ScheduleEmployeeConfig,
  SolverOptions,
  SolverResult,
  Weekday,
} from './scheduleSolver5x2';

const DOW_LABELS: Record<number, string> = {
  0: 'Domingo',
  1: 'Segunda',
  2: 'Terça',
  3: 'Quarta',
  4: 'Quinta',
  5: 'Sexta',
  6: 'Sábado',
};

function fmtHHMM(totalMinutes: number): string {
  const isNeg = totalMinutes < 0;
  const abs = Math.abs(Math.round(totalMinutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${isNeg ? '-' : ''}${h}:${String(m).padStart(2, '0')}`;
}

function fmtBrDate(iso?: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function fmtBrShort(iso?: string): string {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

export interface ExportControleJornadaParams {
  solverResult: SolverResult;
  employees: ScheduleEmployeeConfig[];
  policy: MtePolicyConfig;
  solverOptions: SolverOptions;
  companyName: string;
  monthLabel: string;
  year: number;
  dailyAlertHours?: number; // padrão 10h
}

/**
 * Gera o PDF "CONTROLE DE JORNADA" (formato individual por semana, Domingo a Sábado,
 * com Entrada, Início/Fim Almoço, Saída, Intervalo, Trabalhadas, Acumulado, Alerta e Status 42h/Folgas).
 */
export function exportControleJornadaPDF({
  solverResult,
  employees,
  policy,
  solverOptions,
  companyName,
  monthLabel,
  year,
  dailyAlertHours = 10,
}: ExportControleJornadaParams): void {
  if (!solverResult.success || employees.length === 0) return;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const marginX = 12;
  const contentW = pageWidth - marginX * 2; // 186mm
  const cardHeight = 86; // cabem 3 cartões limpos por página A4 (3 * 86 + margens = 278mm)

  let y = 10;

  for (let wIdx = 0; wIdx < solverResult.weeks.length; wIdx++) {
    const week = solverResult.weeks[wIdx];
    const assign = solverResult.assignments[wIdx];

    // Domingo anterior à segunda da semana (para a tabela começar no Domingo como no modelo)
    const sunBeforeMonday = new Date(
      week.mondayDate.getFullYear(),
      week.mondayDate.getMonth(),
      week.mondayDate.getDate() - 1
    );
    const sunBeforeIso = `${sunBeforeMonday.getFullYear()}-${String(
      sunBeforeMonday.getMonth() + 1
    ).padStart(2, '0')}-${String(sunBeforeMonday.getDate()).padStart(2, '0')}`;

    const monShort = fmtBrShort(week.datesByDow[1]);
    const satShort = fmtBrShort(week.datesByDow[6]);
    const weekHeaderTitle = `CONTROLE DE JORNADA  |  SEMANA ${monShort} A ${satShort}${
      companyName ? `  —  ${companyName.toUpperCase()}` : ''
    }`;

    for (const emp of employees) {
      if (y + cardHeight > 287) {
        doc.addPage();
        y = 10;
      }

      const offDay = assign.offDayByEmployee[emp.id];
      const shift = resolveShiftForEmployeeInWeek(
        emp,
        assign.legalMaxWeeklyHours,
        assign.appliedShift,
        policy,
        offDay,
        solverOptions
      );

      const baseHours =
        (emp.workloadSource === 'custom' || emp.workloadSource === 'custom_shift') &&
        emp.customWeeklyHours
          ? emp.customWeeklyHours
          : assign.legalMaxWeeklyHours;
      const baseMinutes = Math.round(baseHours * 60);

      // Monta os 7 dias da semana começando pelo Domingo (Dom, Seg, Ter, Qua, Qui, Sex, Sáb)
      const dayOrder = [0, 1, 2, 3, 4, 5, 6];
      let totalWorkedMin = 0;
      let offCount = 0;
      let alertDays = 0;

      const dayRows = dayOrder.map((dow) => {
        const iso = dow === 0 ? sunBeforeIso : week.datesByDow[dow];
        const isSunday = dow === 0;
        const isSatOff =
          dow === 6 &&
          (offDay === 6 ||
            emp.offMode === 'mon_fri' ||
            !shift.saturdayStart ||
            !shift.saturdayEnd ||
            shift.saturdayStart === shift.saturdayEnd);
        const isWeekdayOff = dow >= 1 && dow <= 5 && offDay === (dow as Weekday);
        const isOff = isSunday || isSatOff || isWeekdayOff;

        if (isOff) {
          offCount++;
          return {
            dowLabel: DOW_LABELS[dow],
            dateBr: fmtBrDate(iso),
            isOff: true,
            entrada: '',
            iniAlmoco: '',
            fimAlmoco: '',
            saida: '',
            escala: 'Folga',
            intervalo: '0:00',
            trabalhadas: '0:00',
            acumulado: fmtHHMM(totalWorkedMin),
            alerta: 'Folga',
          };
        }

        const isSat = dow === 6;
        const entrada = isSat ? shift.saturdayStart : shift.workStart;
        const iniAlmoco = isSat
          ? shift.saturdayBreakStart && shift.saturdayBreakStart !== '-'
            ? shift.saturdayBreakStart
            : ''
          : shift.breakStart && shift.breakStart !== '-'
          ? shift.breakStart
          : '';
        const fimAlmoco = isSat
          ? shift.saturdayBreakEnd && shift.saturdayBreakEnd !== '-'
            ? shift.saturdayBreakEnd
            : ''
          : shift.breakEnd && shift.breakEnd !== '-'
          ? shift.breakEnd
          : '';
        const saida = isSat ? shift.saturdayEnd : shift.workEnd;

        const hasBreak = Boolean(iniAlmoco && fimAlmoco);
        const breakMin = hasBreak
          ? Math.max(0, parseMinutes(fimAlmoco) - parseMinutes(iniAlmoco))
          : 0;
        const workedMin = Math.max(0, parseMinutes(saida) - parseMinutes(entrada) - breakMin);
        totalWorkedMin += workedMin;

        const isAlert = workedMin > dailyAlertHours * 60;
        if (isAlert) alertDays++;

        return {
          dowLabel: DOW_LABELS[dow],
          dateBr: fmtBrDate(iso),
          isOff: false,
          entrada,
          iniAlmoco: iniAlmoco || '-',
          fimAlmoco: fimAlmoco || '-',
          saida,
          escala: 'Trabalho',
          intervalo: fmtHHMM(breakMin),
          trabalhadas: fmtHHMM(workedMin),
          acumulado: fmtHHMM(totalWorkedMin),
          alerta: isAlert ? 'ALERTA' : 'OK',
        };
      });

      const diffMin = totalWorkedMin - baseMinutes;
      const statusJornada =
        Math.abs(diffMin) <= 5
          ? `DENTRO DAS ${baseHours}H`
          : diffMin < 0
          ? `ABAIXO DAS ${baseHours}H`
          : `ACIMA DAS ${baseHours}H`;
      const statusFolgas = `${offCount} FOLGA${offCount === 1 ? '' : 'S'}`;

      // 1. Barra de título azul-marinho
      doc.setFillColor(27, 54, 93);
      doc.rect(marginX, y, contentW, 6.2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text(weekHeaderTitle, pageWidth / 2, y + 4.3, { align: 'center' });
      y += 7.2;

      // 2. Linha de informações do colaborador
      const infoCols = [
        { label: 'Colaborador(a)', val: emp.name.toUpperCase(), lw: 26, vw: 48 },
        { label: 'Base (horas)', val: String(baseHours), lw: 22, vw: 14 },
        { label: 'Meta de folgas', val: '2', lw: 24, vw: 12 },
        { label: 'Alerta diário (h)', val: String(dailyAlertHours), lw: 26, vw: 14 },
      ];
      let ix = marginX;
      doc.setFontSize(6.8);
      for (const c of infoCols) {
        doc.setFillColor(27, 54, 93);
        doc.rect(ix, y, c.lw, 4.8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.text(c.label, ix + c.lw / 2, y + 3.3, { align: 'center' });
        ix += c.lw;

        doc.setFillColor(248, 245, 232);
        doc.rect(ix, y, c.vw, 4.8, 'F');
        doc.setTextColor(30, 41, 59);
        doc.setFont('helvetica', 'bold');
        doc.text(c.val.substring(0, 26), ix + c.vw / 2, y + 3.3, { align: 'center' });
        ix += c.vw;
      }
      y += 5.8;

      // 3. Cards de resumo (5 colunas)
      const summaryCols = [
        { title: 'HORAS TRABALHADAS', val: fmtHHMM(totalWorkedMin), w: 34, bg: [241, 245, 249], fg: [15, 23, 42] },
        { title: 'JORNADA BASE', val: fmtHHMM(baseMinutes), w: 34, bg: [241, 245, 249], fg: [15, 23, 42] },
        { title: 'DIFERENÇA', val: fmtHHMM(diffMin), w: 34, bg: [241, 245, 249], fg: [15, 23, 42] },
        {
          title: 'STATUS DA JORNADA',
          val: statusJornada,
          w: 42,
          bg: diffMin > 5 ? [185, 28, 28] : diffMin < -5 ? [146, 118, 44] : [46, 111, 64],
          fg: [255, 255, 255],
        },
        {
          title: 'STATUS DAS FOLGAS',
          val: statusFolgas,
          w: 42,
          bg: offCount >= 2 ? [46, 111, 64] : [180, 83, 9],
          fg: [255, 255, 255],
        },
      ];
      let sx = marginX;
      for (const sc of summaryCols) {
        doc.setFillColor(27, 54, 93);
        doc.rect(sx, y, sc.w, 3.8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6);
        doc.text(sc.title, sx + sc.w / 2, y + 2.7, { align: 'center' });

        doc.setFillColor(sc.bg[0], sc.bg[1], sc.bg[2]);
        doc.rect(sx, y + 3.8, sc.w, 5.4, 'F');
        doc.setTextColor(sc.fg[0], sc.fg[1], sc.fg[2]);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.8);
        doc.text(sc.val, sx + sc.w / 2, y + 7.5, { align: 'center' });

        doc.setDrawColor(203, 213, 225);
        doc.rect(sx, y, sc.w, 9.2);
        sx += sc.w;
      }
      y += 10.4;

      // 4. Tabela de dias (Dom -> Sáb)
      const colDefs = [
        { title: 'Dia', w: 28 },
        { title: 'Entrada', w: 17 },
        { title: 'Início almoço', w: 19 },
        { title: 'Fim almoço', w: 19 },
        { title: 'Saída', w: 17 },
        { title: 'Escala', w: 18 },
        { title: 'Intervalo', w: 16 },
        { title: 'Trabalhadas', w: 18 },
        { title: 'Acumulado', w: 18 },
        { title: 'Alerta', w: 16 },
      ];

      let tx = marginX;
      doc.setFillColor(27, 54, 93);
      doc.rect(marginX, y, contentW, 4.4, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.2);
      for (const cd of colDefs) {
        doc.text(cd.title, tx + cd.w / 2, y + 3.1, { align: 'center' });
        tx += cd.w;
      }
      y += 4.4;

      const rowH = 6.2;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.4);
      for (const r of dayRows) {
        tx = marginX;
        const vals = [
          `${r.dowLabel}\n${r.dateBr}`,
          r.entrada,
          r.iniAlmoco,
          r.fimAlmoco,
          r.saida,
          r.escala,
          r.intervalo,
          r.trabalhadas,
          r.acumulado,
          r.alerta,
        ];

        for (let cIdx = 0; cIdx < colDefs.length; cIdx++) {
          const w = colDefs[cIdx].w;
          // Cor de fundo das colunas de horário/escala
          if (cIdx >= 1 && cIdx <= 5) {
            if (r.isOff) {
              doc.setFillColor(246, 237, 217); // bege suave (Folga)
            } else {
              doc.setFillColor(227, 240, 229); // verde suave (Trabalho)
            }
            doc.rect(tx, y, w, rowH, 'F');
          }
          doc.setDrawColor(215, 222, 230);
          doc.rect(tx, y, w, rowH);

          doc.setTextColor(30, 41, 59);
          if (cIdx === 0) {
            doc.setFont('helvetica', 'bold');
            doc.text(r.dowLabel, tx + w / 2, y + 2.6, { align: 'center' });
            doc.setFont('helvetica', 'normal');
            doc.text(r.dateBr, tx + w / 2, y + 5.2, { align: 'center' });
          } else {
            doc.setFont('helvetica', cIdx === 7 ? 'bold' : 'normal');
            doc.text(vals[cIdx], tx + w / 2, y + 3.9, { align: 'center' });
          }
          tx += w;
        }
        y += rowH;
      }

      // 5. Rodapé TOTAL DA SEMANA
      doc.setFillColor(27, 54, 93);
      doc.rect(marginX, y, contentW, 4.8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.6);
      doc.text('TOTAL DA SEMANA', marginX + 60, y + 3.4, { align: 'center' });
      doc.text(fmtHHMM(totalWorkedMin), marginX + 143, y + 3.4, { align: 'center' });
      doc.text(`${alertDays} dia(s) com alerta`, marginX + 170, y + 3.4, { align: 'center' });

      y += 9.5;
    }
  }

  doc.save(`controle-jornada-${monthLabel.toLowerCase()}-${year}.pdf`);
}
