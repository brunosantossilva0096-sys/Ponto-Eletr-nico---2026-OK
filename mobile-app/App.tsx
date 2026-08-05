import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, Button, Alert } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';

// Substitua pela URL e Key reais do Supabase
const SUPABASE_URL = 'SUA_SUPABASE_URL';
const SUPABASE_KEY = 'SUA_SUPABASE_ANON_KEY';

export default function App() {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);

  useEffect(() => {
    async function init() {
      // Verifica suporte a biometria
      const compatible = await LocalAuthentication.hasHardwareAsync();
      setIsBiometricSupported(compatible);

      // Obtem ou gera Device ID (fallback seguro para MAC)
      let id = await SecureStore.getItemAsync('DEVICE_UUID');
      if (!id) {
        if (Application.androidId) {
          id = Application.androidId;
        } else {
          // iOS ou fallback
          id = await Application.getIosIdForVendorAsync();
        }
        if (id) await SecureStore.setItemAsync('DEVICE_UUID', id);
      }
      setDeviceId(id);
    }
    init();
  }, []);

  const handlePunch = async () => {
    if (!isBiometricSupported) {
      Alert.alert('Erro', 'Este dispositivo não suporta biometria.');
      return;
    }

    const authResult = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Autentique-se para registrar o ponto',
      fallbackLabel: 'Usar senha',
    });

    if (authResult.success) {
      // Biometria confirmada! Agora envia para o backend.
      Alert.alert('Sucesso', 'Biometria lida com sucesso! \nDevice ID: ' + deviceId);
      
      /*
      // Exemplo de integração futura com Supabase:
      try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/pontos`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
          },
          body: JSON.stringify({
            employee_id: 1, // Exemplo
            device_id: deviceId,
            timestamp: new Date().toISOString()
          })
        });
        
        if (response.ok) {
           Alert.alert('Ponto Registrado', 'Seu ponto foi registrado com sucesso!');
        }
      } catch (e) {
         Alert.alert('Erro', 'Falha na comunicação com o servidor.');
      }
      */
    } else {
      Alert.alert('Falha', 'Autenticação biométrica falhou.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ponto Eletrônico Híbrido</Text>
      <Text style={styles.device}>Device ID: {deviceId || 'Carregando...'}</Text>
      
      <View style={styles.buttonContainer}>
        <Button title="Registrar Ponto (Biometria)" onPress={handlePunch} />
      </View>
      
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  device: {
    fontSize: 12,
    color: '#666',
    marginBottom: 40,
  },
  buttonContainer: {
    marginTop: 20,
    width: '100%',
  }
});
