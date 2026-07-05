const fs = require('fs');

const path = 'src/App.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add supabase import
if (!content.includes('import { supabase } from')) {
  content = content.replace(
    "import { EMPLOYEE_DATA } from './utils';",
    "import { EMPLOYEE_DATA } from './utils';\nimport { supabase } from './supabaseClient';"
  );
}

// 2. Rewrite the data loading useEffect
const dataLoadingRegex = /\/\/ --- 2\. CARREGAR DADOS DO LOCAL STORAGE ---[\s\S]*?\}, \[\]\);/;
const newDataLoading = `// --- 2. CARREGAR DADOS DO SUPABASE E LOCAL STORAGE ---
  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: logsData } = await supabase.from('time_logs').select('*').order('timestamp', { ascending: false });
        if (logsData) setLogs(logsData as TimeLog[]);

        const { data: absencesData } = await supabase.from('absences').select('*').order('date', { ascending: false });
        if (absencesData) setAbsences(absencesData as Absence[]);

        const { data: requestsData } = await supabase.from('adjustment_requests').select('*').order('date', { ascending: false });
        if (requestsData) setAdjustmentRequests(requestsData as AdjustmentRequest[]);

        // Feriados ainda locais para simplificar
        const savedHolidays = localStorage.getItem('ponto_holidays_secure');
        if (savedHolidays) setHolidays(decryptSecure(savedHolidays) || []);

        const savedHqCoords = localStorage.getItem('ponto_hq_coords');
        if (savedHqCoords) setHqCoords(JSON.parse(savedHqCoords));
      } catch (e) {
        console.error("Erro ao carregar dados do Supabase", e);
      }
    };
    fetchData();
  }, []);`;
content = content.replace(dataLoadingRegex, newDataLoading);

// 3. Rewrite save functions
content = content.replace(
  /const saveLogsSecurely = \([\s\S]*?\};/,
  `const saveLogsSecurely = async (updatedLogs: TimeLog[]) => {
    setLogs(updatedLogs);
    const newLog = updatedLogs[0]; // Upserting only the most recent for efficiency
    if (newLog) await supabase.from('time_logs').upsert(newLog);
  };`
);

content = content.replace(
  /const saveAbsencesSecurely = \([\s\S]*?\};/,
  `const saveAbsencesSecurely = async (updatedAbsences: Absence[]) => {
    setAbsences(updatedAbsences);
    await supabase.from('absences').upsert(updatedAbsences);
  };`
);

content = content.replace(
  /const saveRequestsSecurely = \([\s\S]*?\};/,
  `const saveRequestsSecurely = async (updatedRequests: AdjustmentRequest[]) => {
    setAdjustmentRequests(updatedRequests);
    await supabase.from('adjustment_requests').upsert(updatedRequests);
  };`
);

// 4. Biometric Registration
content = content.replace(
  `const response = await fetch('http://localhost:8000/SGIFPEnroll', {`,
  `// Salvar no Supabase em vez do servidor local
      const { error } = await supabase.from('biometric_templates').upsert({
        user_id: userId,
        finger_id: 'index',
        template: data.template
      });
      
      if (!error) {
        setHasRegisteredFingerprint(true);
      } else {
        throw new Error('Falha ao salvar no Supabase');
      }
      
      /*`
);
content = content.replace(
  `      if (enrollData.success) {
        setHasRegisteredFingerprint(true);
      } else {
        throw new Error(enrollData.error || 'Erro desconhecido');
      }`,
  `*/`
);

// 5. Biometric Matching
// Encontrar o matching atual e substituir
const matchFetchRegex = /const response = await fetch\('http:\/\/localhost:8000\/SGIFPMatch', \{[\s\S]*?body: JSON\.stringify\(\{ template: data\.template, userId \}\)[\s\S]*?\}\);/;
const newMatchFetch = `// Primeiro buscar a digital salva do Supabase
        const { data: dbData } = await supabase.from('biometric_templates')
          .select('template')
          .eq('user_id', userId)
          .single();
          
        if (!dbData || !dbData.template) {
          throw new Error('Digital não encontrada no banco de dados');
        }

        // Enviar os dois templates para o servidor local comparar
        const response = await fetch('http://localhost:8000/SGIFPMatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            template1: data.template, 
            template2: dbData.template 
          })
        });`;
content = content.replace(matchFetchRegex, newMatchFetch);

// 6. SGIFPExists (verificar se tem digital)
const existsFetchRegex = /const response = await fetch\(\`http:\/\/localhost:8000\/SGIFPExists\/\$\{userId\}\`\);[\s\S]*?setHasRegisteredFingerprint\(data\.exists\);[\s\S]*?\}/;
const newExistsFetch = `const { data } = await supabase.from('biometric_templates').select('user_id').eq('user_id', userId).maybeSingle();
          setHasRegisteredFingerprint(!!data);`;
content = content.replace(existsFetchRegex, newExistsFetch);

fs.writeFileSync(path, content, 'utf8');
console.log('App.tsx refatorado com sucesso!');
