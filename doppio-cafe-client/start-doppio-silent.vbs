Set WshShell = CreateObject("WScript.Shell")
' Get the current directory of this script
scriptPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
' Run the batch file in completely silent mode (0 parameter hides the window)
WshShell.Run """" & scriptPath & "\launch-doppio.bat""", 0, False
