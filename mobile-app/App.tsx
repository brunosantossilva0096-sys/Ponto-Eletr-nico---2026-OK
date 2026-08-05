import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TextInput, Button, Alert, ActivityIndicator, ScrollView } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// O GITHUB BLOQUEOU O PUSH PORQUE A CHAVE ABAIXO É UM SEGREDO E NÃO DEVE IR PRO CÓDIGO
// USE VARIÁVEIS DE AMBIENTE OU INSIRA LOCALMENTE ANTES DE COMPILAR
const SUPABASE_URL = 'https://ovztfrwoitardrikyjcx.supabase.co';
const SUPABASE_ANON_KEY = 'SUA_SUPABASE_ANON_KEY_AQUI_NOVAMENTE';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function App() {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function init() {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      setIsBiometricSupported(compatible);

      let id = await SecureStore.getItemAsync('DEVICE_UUID');
      if (!id) {
        if (Application.androidId) {
          id = Application.androidId;
        } else {
          id = await Application.getIosIdForVendorAsync();
        }
        if (id) await SecureStore.setItemAsync('DEVICE_UUID', id);
      }
      setDeviceId(id);
    }
    init();
  }, []);

  const handlePunch = async (type: 'entrada' | 'saida_almoco' | 'retorno_almoco' | 'saida') => {
    if (!pin) {
      Alert.alert('Atenção', 'Digite seu PIN primeiro.');
      return;
    }
    
    if (!isBiometricSupported) {
      Alert.alert('Erro', 'Este dispositivo não suporta biometria (FaceID/TouchID).');
      return;
    }

    setLoading(true);

    try {
      // 1. Buscar o funcionário pelo PIN
      const { data: employee, error: empError } = await supabase
        .from('employees')
        .select('*')
        .eq('pin', pin)
        .single();

      if (empError || !employee) {
        Alert.alert('Erro', 'PIN inválido ou funcionário não encontrado.');
        setLoading(false);
        return;
      }

      // 2. Verificar restrições de mobile
      if (employee.block_mobile_access) {
        Alert.alert('Acesso Negado', 'Este funcionário não tem permissão para bater ponto pelo celular.');
        setLoading(false);
        return;
      }

      if (employee.allowed_mobile_device_id && employee.allowed_mobile_device_id !== deviceId) {
        Alert.alert('Acesso Negado', 'Este celular não é o aparelho autorizado para este funcionário.');
        setLoading(false);
        return;
      }

      // 3. Chamar biometria nativa do celular (FaceID / Fingerprint)
      const authResult = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Confirme sua biometria para registrar o ponto',
        fallbackLabel: 'Usar senha do celular',
      });

      if (!authResult.success) {
        Alert.alert('Falha', 'Autenticação biométrica cancelada ou falhou.');
        setLoading(false);
        return;
      }

      // 4. Inserir o registro no banco
      const log = {
        employee_id: employee.id,
        timestamp: new Date().toISOString(),
        type: type,
        verification_method: 'Biometria Mobile',
        pis_pasep_trabalhador: employee.pis,
        cpf_trabalhador: employee.cpf
      };

      const { error: insertError } = await supabase.from('time_logs').insert([log]);

      if (insertError) {
        Alert.alert('Erro', 'Não foi possível salvar o ponto. Verifique sua conexão.');
      } else {
        Alert.alert('Sucesso', `Ponto (${type.replace('_', ' ')}) registrado com sucesso!`);
        setPin('');
      }

    } catch (e) {
      Alert.alert('Erro Inesperado', 'Ocorreu um erro na comunicação com o servidor.');
    }

    setLoading(false);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Ponto Eletrônico Mobile</Text>
      
      <Text style={styles.label}>Seu Device ID (Passe para o RH se necessário):</Text>
      <Text style={styles.device} selectable={true}>{deviceId || 'Carregando...'}</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Digite seu PIN de Acesso:</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          secureTextEntry
          value={pin}
          onChangeText={setPin}
          placeholder="Ex: 1234"
        />

        {loading ? (
          <ActivityIndicator size="large" color="#00ff00" style={{ marginTop: 20 }} />
        ) : (
          <View style={styles.buttons}>
            <View style={styles.buttonRow}>
              <Button title="Entrada" color="#28a745" onPress={() => handlePunch('entrada')} />
              <Button title="Saída Almoço" color="#ffc107" onPress={() => handlePunch('saida_almoco')} />
            </View>
            <View style={styles.buttonRow}>
              <Button title="Retorno Almoço" color="#17a2b8" onPress={() => handlePunch('retorno_almoco')} />
              <Button title="Saída" color="#dc3545" onPress={() => handlePunch('saida')} />
            </View>
          </View>
        )}
      </View>

      <StatusBar style="auto" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#f4f4f5',
    alignItems: 'center',
    padding: 20,
    paddingTop: 80,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333'
  },
  label: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 5,
  },
  device: {
    fontSize: 12,
    color: '#999',
    marginBottom: 40,
    textAlign: 'center',
    backgroundColor: '#e4e4e7',
    padding: 10,
    borderRadius: 5,
  },
  card: {
    width: '100%',
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 15,
    borderRadius: 8,
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 30,
  },
  buttons: {
    gap: 15,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 10,
  }
});
