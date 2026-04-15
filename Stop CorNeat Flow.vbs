' CorNeat Flow — Stop
' Shuts down the data server and Next.js server.

Option Explicit

Dim shell, scriptDir, stopPath

Set shell = CreateObject("WScript.Shell")
scriptDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
stopPath  = scriptDir & "corneat-flow-v2\stop.js"

Dim fso
Set fso = CreateObject("Scripting.FileSystemObject")
If Not fso.FileExists(stopPath) Then
  MsgBox "stop.js not found.", 48, "CorNeat Flow"
  WScript.Quit 1
End If

shell.Run "node """ & stopPath & """", 0, True

MsgBox "CorNeat Flow has been stopped.", 64, "CorNeat Flow"
