# Integração SECUGEN U20-A USB FRD - Guia de Instalação

## Visão Geral

Este documento descreve como configurar a integração real do leitor biométrico SECUGEN U20-A USB FRD com o sistema de ponto eletrônico.

## Status Atual

A implementação atual funciona em **modo de simulação** para desenvolvimento e testes. Para uso em produção com o hardware real, é necessário instalar o SDK nativo da SecuGen.

## Pré-requisitos para Uso Real

### 1. Hardware
- Leitor biométrico SECUGEN U20-A USB FRD
- Computador com Windows 10/11 (64-bit)
- Porta USB disponível

### 2. Software Necessário

#### Drivers do SECUGEN U20-A
1. Baixe os drivers do site oficial: https://secugen.com/download/
2. Instale os drivers do SECUGEN U20-A
3. Conecte o leitor USB e verifique se foi reconhecido pelo Windows

#### FDx SDK Pro da SecuGen
1. Baixe o FDx SDK Pro para Windows em: https://secugen.com/products/sdk/
2. Instale o SDK seguindo as instruções do instalador
3. Anote o caminho de instalação (geralmente `C:\Program Files\SecuGen\FDx SDK Pro`)

## Instalação Simplificada em Outro Computador

Para rodar este projeto em outro computador Windows (64-bit), você não precisa baixar os arquivos manualmente ou alterar o código:

1. **Copie a pasta inteira do projeto** para o novo computador.
2. Certifique-se de que a pasta contém as subpastas `drivers/` (com o instalador `sgdrvsetupu20x64.msi`) e `sdk/bin/x64/` (com as DLLs).
3. Dê um duplo-clique no arquivo **`install-secugen.bat`** localizado na raiz do projeto.
4. O script irá:
   * Solicitar privilégios de administrador (necessários para instalar drivers).
   * Verificar se o Node.js está instalado.
   * Executar `npm install` para instalar todas as dependências locais.
   * Instalar os drivers do leitor biométrico SecuGen U20 automaticamente.
5. Conecte o leitor USB e rode `npm run server` para iniciar.

## Configuração do Backend para Uso Real

### Passo 1: Modificar o server.js

Substitua as funções simuladas por chamadas ao SDK nativo:

```javascript
// No topo do arquivo, adicione:
const sgfplib = require('path/to/sgfplib'); // Caminho para o SDK da SecuGen

// Substitua a função simulateFingerprintCapture por:
async function captureFingerprintReal(timeout, quality) {
  return new Promise((resolve, reject) => {
    const deviceHandle = sgfplib.SGFDXDeviceHandle();
    
    // Inicializar dispositivo
    const initResult = sgfplib.SGFDXInit(deviceHandle, sgfplib.SG_DEV_AUTO);
    if (initResult !== 0) {
      reject(new Error('Falha ao inicializar dispositivo'));
      return;
    }
    
    // Capturar imagem
    const captureResult = sgfplib.SGFDXGetImage(deviceHandle);
    if (captureResult !== 0) {
      sgfplib.SGFDXClose(deviceHandle);
      reject(new Error('Falha ao capturar imagem'));
      return;
    }
    
    // Obter imagem em formato base64
    const imageData = sgfplib.SGFDXGetImageBase64(deviceHandle);
    
    // Criar template
    const template = sgfplib.SGFDXGetTemplate(deviceHandle);
    
    sgfplib.SGFDXClose(deviceHandle);
    
    resolve({
      imageData: imageData,
      template: template,
      quality: quality,
      format: 'ISO'
    });
  });
}
```

### Passo 2: Implementar Matching Real

```javascript
// Substitua a função simulateFingerprintMatch por:
async function matchFingerprintsReal(template1, template2) {
  return new Promise((resolve) => {
    const matchResult = sgfplib.SGFDXMatchTemplate(
      template1,
      template2,
      sgfplib.SL_NORMAL
    );
    
    // matchResult retorna score de 0-100
    const threshold = 60;
    resolve({
      matched: matchResult >= threshold,
      score: matchResult,
      threshold
    });
  });
}
```

### Passo 3: Atualizar os Endpoints

Modifique os endpoints para usar as funções reais:

```javascript
// No endpoint /SGIFPCapture:
const mockCapture = await captureFingerprintReal(timeout, quality);

// No endpoint /SGIFPMatch:
const matchResult = await matchFingerprintsReal(template, storedTemplate.template);
```

## Testes

### Teste em Modo Simulação (Atual)

1. Inicie o backend:
```bash
npm run server
```

2. Inicie o frontend:
```bash
npm run dev
```

3. Acesse http://localhost:3000
4. Tente registrar um ponto - o sistema usará a simulação biométrica

### Teste com Hardware Real

1. Após instalar o SDK e modificar o código
2. Conecte o leitor SECUGEN U20-A
3. Inicie o backend
4. Teste a captura e verificação de digitais

## Solução de Problemas

### Erro: "Dispositivo não encontrado"
- Verifique se o leitor está conectado
- Verifique se os drivers foram instalados corretamente
- Teste em outra porta USB

### Erro: "Falha ao inicializar SDK"
- Verifique o caminho do SDK no código
- Certifique-se de que o SDK foi instalado corretamente
- Verifique as permissões do Windows

### Erro: "Falha na captura"
- Verifique se o leitor está sendo usado por outro aplicativo
- Reinicie o computador
- Desconecte e reconecte o leitor

## Licenciamento

O SDK da SecuGen requer licença para uso em produção:
- Versão de teste: 60 dias sem licença
- Licença comercial: Entre em contato com a SecuGen
- Site: https://secugen.com/contact/

## Arquitetura da Solução

```
Frontend (React)
    ↓ HTTP/REST
Backend Express (Node.js)
    ↓ Chamadas Nativas
FDx SDK Pro (SecuGen)
    ↓ USB
SECUGEN U20-A USB FRD
```

## Armazenamento de Templates

A implementação atual usa `Map` em memória. Para produção:

- Use banco de dados (PostgreSQL, MongoDB)
- Criptografe os templates (LGPD)
- Implemente backup e recuperação
- Considere usar banco de dados biométrico especializado

## Segurança

- Templates biométricos são dados sensíveis
- Criptografe sempre que possível
- Use HTTPS em produção
- Implemente autenticação no backend
- Log de acessos para auditoria

## Suporte

- Documentação SecuGen: https://secugen.com/
- Suporte técnico: support@secugen.com
- Fórum da comunidade: https://secugen.com/support/

## Notas Importantes

1. **Ambiente Windows**: O SDK da SecuGen é específico para Windows. Para Linux, é necessário usar alternativas ou virtualização.

2. **Comunicação USB**: O SDK requer acesso direto ao dispositivo via USB. Não funciona via rede.

3. **Licença**: O SDK tem período de teste de 60 dias. Após isso, é necessário adquirir licença.

4. **Desenvolvimento**: A implementação atual permite desenvolvimento e testes sem o hardware físico.

## Próximos Passos

1. Instalar drivers e SDK da SecuGen
2. Modificar o código para usar o SDK nativo
3. Testar com hardware real
4. Implementar armazenamento persistente
5. Adicionar criptografia de templates
6. Configurar licença do SDK para produção
