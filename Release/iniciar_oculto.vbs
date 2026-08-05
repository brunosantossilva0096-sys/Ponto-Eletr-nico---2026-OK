Set WshShell = CreateObject("WScript.Shell")
' Executa o arquivo Servidor_Ponto.exe na mesma pasta que este script
' O parametro 0 diz para rodar de forma oculta (sem janela preta)
WshShell.Run chr(34) & CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & "\Servidor_Ponto.exe" & chr(34), 0
Set WshShell = Nothing
