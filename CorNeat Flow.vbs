' CorNeat Flow — Silent Launcher
' Double-click this to start the app with no terminal window.
' The browser will open automatically once the app is ready.

Option Explicit

Dim shell, scriptDir, launcherPath

Set shell = CreateObject("WScript.Shell")

' Get the folder this .vbs file lives in
scriptDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))

' Path to launcher.js (inside corneat-flow-v2 subfolder)
launcherPath = scriptDir & "corneat-flow-v2\launcher.js"

' Check launcher exists
Dim fso
Set fso = CreateObject("Scripting.FileSystemObject")
If Not fso.FileExists(launcherPath) Then
  MsgBox "Could not find launcher.js at:" & vbCrLf & launcherPath & vbCrLf & vbCrLf & _
         "Make sure the corneat-flow-v2 folder is in the same location as this file.", _
         48, "CorNeat Flow"
  WScript.Quit 1
End If

' Run node launcher.js — 0 = hidden window, False = don't wait
shell.Run "node """ & launcherPath & """", 0, False

' Brief pause so the user gets feedback
WScript.Sleep 1200

' Show a non-blocking tooltip in the system tray area
shell.Run "mshta ""javascript:var sh=new ActiveXObject('WScript.Shell');" & _
  "sh.Popup('CorNeat Flow is starting\u2026\n\nYour browser will open automatically.',3,'CorNeat Flow \u2714',64);close()""", _
  0, False
