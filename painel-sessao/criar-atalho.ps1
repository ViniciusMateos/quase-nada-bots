# Cria o "app" do painel no Windows: atalho no Menu Iniciar com o icone, que abre
# o painel numa janela de app do Chrome (--app, sem barra de endereco), e deixa
# a janela aberta pra fixar na barra de tarefas.
#
# O atalho recebe o MESMO AppUserModelID que o Chrome da pra janela --app; assim
# atalho, icone fixado e janela aberta viram um botao so na barra (sem duplicar).
#
# Uso: powershell -ExecutionPolicy Bypass -File criar-atalho.ps1 `
#        -Nome "Quase Nada Lembretes" -Url "http://quase-nada-lembretes.localhost:5178" `
#        -Icone "C:\...\public\app.ico" -TituloJanela "Quase Nada Lembretes"
param(
  [Parameter(Mandatory)] [string] $Nome,
  [Parameter(Mandatory)] [string] $Url,
  [Parameter(Mandatory)] [string] $Icone,
  # Trecho do <title> da pagina, pra achar a janela depois de abrir.
  [Parameter(Mandatory)] [string] $TituloJanela,
  [string] $Perfil = 'Default'
)
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;

public static class AppUserModel {
  [StructLayout(LayoutKind.Sequential, Pack = 4)]
  struct PROPERTYKEY { public Guid fmtid; public uint pid; }

  [StructLayout(LayoutKind.Explicit, Size = 24)]
  struct PROPVARIANT { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr p; }

  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPropertyStore {
    [PreserveSig] int GetCount(out uint c);
    [PreserveSig] int GetAt(uint i, out PROPERTYKEY k);
    [PreserveSig] int GetValue(ref PROPERTYKEY k, out PROPVARIANT v);
    [PreserveSig] int SetValue(ref PROPERTYKEY k, ref PROPVARIANT v);
    [PreserveSig] int Commit();
  }

  [ComImport, Guid("00021401-0000-0000-C000-000000000046")] class CShellLink { }

  [DllImport("shell32.dll")] static extern int SHGetPropertyStoreForWindow(IntPtr hwnd, ref Guid riid, out IPropertyStore ps);
  [DllImport("ole32.dll")] static extern int PropVariantClear(ref PROPVARIANT pv);
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);

  static PROPERTYKEY Key() {
    return new PROPERTYKEY { fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = 5 };
  }

  // Janela de app (--app) do Chrome com esse titulo. Aba comum fica de fora:
  // o titulo dela termina em "- Google Chrome" e o ID dela e o do navegador.
  public static IntPtr FindWindow(string titlePart) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      var sb = new StringBuilder(512);
      GetWindowText(h, sb, 512);
      string t = sb.ToString();
      if (t.IndexOf(titlePart, StringComparison.OrdinalIgnoreCase) < 0) return true;
      if (t.EndsWith("Google Chrome", StringComparison.OrdinalIgnoreCase)) return true;
      uint pid;
      GetWindowThreadProcessId(h, out pid);
      try {
        if (!System.Diagnostics.Process.GetProcessById((int)pid).ProcessName.Equals("chrome", StringComparison.OrdinalIgnoreCase)) return true;
      } catch { return true; }
      found = h;
      return false;
    }, IntPtr.Zero);
    return found;
  }

  public static string GetForWindow(IntPtr hwnd) {
    var iid = typeof(IPropertyStore).GUID;
    IPropertyStore ps;
    if (SHGetPropertyStoreForWindow(hwnd, ref iid, out ps) != 0) return null;
    var k = Key();
    PROPVARIANT v;
    if (ps.GetValue(ref k, out v) != 0) return null;
    string s = v.vt == 31 ? Marshal.PtrToStringUni(v.p) : null;
    PropVariantClear(ref v);
    return s;
  }

  public static void SetForShortcut(string lnk, string aumid) {
    var link = new CShellLink();
    ((IPersistFile)link).Load(lnk, 2);
    var ps = (IPropertyStore)link;
    var k = Key();
    var v = new PROPVARIANT { vt = 31, p = Marshal.StringToCoTaskMemUni(aumid) };
    int hr = ps.SetValue(ref k, ref v);
    if (hr != 0) throw new Exception("SetValue 0x" + hr.ToString("X"));
    hr = ps.Commit();
    if (hr != 0) throw new Exception("Commit 0x" + hr.ToString("X"));
    ((IPersistFile)link).Save(lnk, true);
    PropVariantClear(ref v);
  }
}
'@

$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
if (-not (Test-Path $chrome)) { throw "Chrome nao encontrado em $chrome" }
if (-not (Test-Path $Icone)) { throw "Icone nao encontrado: $Icone" }
$args_ = "--profile-directory=$Perfil --app=$Url"

# 1) Atalho no Menu Iniciar (Win + nome acha ele)
$lnk = Join-Path ([Environment]::GetFolderPath('Programs')) "$Nome.lnk"
$sc = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$sc.TargetPath = $chrome
$sc.Arguments = $args_
$sc.IconLocation = "$Icone,0"
$sc.WorkingDirectory = Split-Path $chrome
$sc.Description = $Nome
$sc.Save()
Write-Output "atalho: $lnk"

# 2) Abre a janela de app e le o AppUserModelID que o Chrome deu pra ela
$hwnd = [AppUserModel]::FindWindow($TituloJanela)
if ($hwnd -eq [IntPtr]::Zero) {
  Start-Process -FilePath $chrome -ArgumentList $args_
  for ($i = 0; $i -lt 30 -and $hwnd -eq [IntPtr]::Zero; $i++) {
    Start-Sleep -Milliseconds 500
    $hwnd = [AppUserModel]::FindWindow($TituloJanela)
  }
}
if ($hwnd -eq [IntPtr]::Zero) { throw "Janela '$TituloJanela' nao apareceu" }
$aumid = [AppUserModel]::GetForWindow($hwnd)
Write-Output "janela AppUserModelID: $aumid"

# 3) Mesmo ID no atalho -> agrupa com a janela na barra de tarefas
if ($aumid) {
  [AppUserModel]::SetForShortcut($lnk, $aumid)
  Write-Output "atalho agora agrupa com a janela"
}
