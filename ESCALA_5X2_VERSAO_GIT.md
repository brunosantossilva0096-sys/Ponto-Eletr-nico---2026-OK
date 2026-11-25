# Versão Commitada — Escala 5x2 (CLT & Portaria MTE nº 2.041/2026)

## Histórico de Commits

| Hash | Mensagem | Data |
|------|----------|------|
| `cefe018` | feat: sabado universal 07h, perfil de horario selecionavel, condicoes individuais maos maleaveis, Weekday inclui 6 | 25/11/2026 |
| `7b5eb96` | feat: horarios 42h por grupo/colaborador a partir de 16/12/2026 e regra individual selecionavel | 25/11/2026 |
| `1347687` | feat: gerador de escala 5x2 com solver CSP e auditoria CLT/Portaria MTE 2041/2026 | 25/11/2026 |

## Referência do Commit Atual
- **Branch:** `main`
- **Commit atual:** `cefe018`
- **Mensagem:** `feat: sabado universal 07h, perfil de horario selecionavel, condicoes individuais maos maleaveis, Weekday inclui 6`
- **Commit anterior:** `7b5eb96`
- **Repositório remoto:** `https://github.com/brunosantossilva0096-sys/Ponto-Eletr-nico---2026-OK.git`

## Arquivos alterados neste commit
- `src/components/AdminSchedule5x2.tsx`
- `src/utils/scheduleSolver5x2.ts`

---

## O que há nesta versão (`cefe018`)

### Motor CSP (`scheduleSolver5x2.ts`)
- `Weekday = 1 | 2 | 3 | 4 | 5 | 6` (Seg–Sáb)
- `ShiftProfileId = 'group' | 'iolanda' | 'bruno'` — perfil de horário selecionável por qualquer colaborador
- **Sábado:** Todo mundo entra **07:00** (Grupo B `saturdayStart: '07:00'`)
- **Perfil Iolanda:** 07:00–17:00 (int. 12–13h), Sáb 07:00–13:00
- **Perfil Bruno:** 07:00–17:00 (int. 11–12h), Sáb 07:00–13:00
- **Perfil Group A:** 07:00–17:15 (int. 12–13h), Sáb 07:00–12:00
- **Perfil Group B:** 07:45–17:15 (int. 12–13h), Sáb **07:00**–12:00
- Condição "somente folgar ao Sábado" (campo `saturdayOnly`)
- `resolveShiftForEmployeeInWeek(offDay?)` com lógica para offDay === 6
- Auditoria MTE: 44h até 15/12/2026, 42h a partir de 16/12/2026

### Interface (`AdminSchedule5x2.tsx`)
- Tabela de escala com coluna **Sáb** mostrando FOLGA ou horário individual
- Sub-aba **Condições Individuais & Coletivas**:
  - Filtro por Grupo (Todos / A / B)
  - Coluna **Perfil 42h** com select (`group | iolanda | bruno`)
  - Dias permitidos incluindo Sáb (botões Seg–Sáb + botão "Só Sáb")
  - Form de regra individual com presets
  - Regras coletivas para qualquer combinação de colaboradores
- Sub-aba **Auditoria CLT & MTE**
- Exportação CSV/PDF com horários individuais

---

## Como voltar para uma versão anterior

### Abrir versão em branch nova (sem apagar histórico)
```bash
git checkout -b backup-sabado-07h cefe018
# ou para a versão anterior:
git checkout -b backup-escala-5x2 7b5eb96
```

### Restaurar `main` exatamente para um commit (CUIDADO: descarta commits posteriores)
```bash
git reset --hard cefe018
```

### Reverter um commit específico (mantendo histórico)
```bash
git revert cefe018
```

