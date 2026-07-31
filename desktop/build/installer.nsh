; RestroSuite LAN kitchen networking
; The installer already runs elevated because this is a per-machine install.
; Keep access private-network only and scoped to this executable + known ports.

!define RS_FIREWALL_TCP_RULE "RestroSuite LAN Kitchen"
!define RS_FIREWALL_UDP_RULE "RestroSuite LAN Discovery"

!macro customInstall
  DetailPrint "Preparing automatic kitchen display networking..."

  ; Recreate stable rules so upgrades also repair old or incomplete installs.
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="${RS_FIREWALL_TCP_RULE}"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="${RS_FIREWALL_UDP_RULE}"'

  ; Local web/KOT service. RestroSuite starts at 8001 and safely tries up to 8020.
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="${RS_FIREWALL_TCP_RULE}" description="Allows RestroSuite kitchen screens on this restaurant private network." dir=in action=allow enable=yes profile=private program="$INSTDIR\RestroSuite.exe" protocol=TCP localport=8001-8020 edge=no'

  ; Zero-touch discovery used by the RestroSuite Android app.
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="${RS_FIREWALL_UDP_RULE}" description="Allows RestroSuite devices to find the POS on this restaurant private network." dir=in action=allow enable=yes profile=private program="$INSTDIR\RestroSuite.exe" protocol=UDP localport=39821 edge=no'
!macroend

!macro customUnInstall
  DetailPrint "Removing RestroSuite kitchen networking permissions..."
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="${RS_FIREWALL_TCP_RULE}"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="${RS_FIREWALL_UDP_RULE}"'
!macroend
