# Sound output devices for the Control Center.
#   audio.ps1 list        -> JSON: [{ id, name, default }]
#   audio.ps1 set <id>    -> makes that device the default output (all roles)
param([string]$cmd = 'list', [string]$id = '')

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
  int OpenPropertyStore(int access, out IntPtr store);
  int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
  int GetState(out int state);
}

[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  int EnumAudioEndpoints(int flow, int mask, out IntPtr devices);
  int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice device);
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumerator {}

[ComImport, Guid("f8679f50-850a-41cf-9c72-430f290290c8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPolicyConfig {
  int GetMixFormat(IntPtr a, IntPtr b);
  int GetDeviceFormat(IntPtr a, int b, IntPtr c);
  int ResetDeviceFormat(IntPtr a);
  int SetDeviceFormat(IntPtr a, IntPtr b, IntPtr c);
  int GetProcessingPeriod(IntPtr a, int b, IntPtr c, IntPtr d);
  int SetProcessingPeriod(IntPtr a, IntPtr b);
  int GetShareMode(IntPtr a, IntPtr b);
  int SetShareMode(IntPtr a, IntPtr b);
  int GetPropertyValue(IntPtr a, int b, IntPtr c, IntPtr d);
  int SetPropertyValue(IntPtr a, int b, IntPtr c, IntPtr d);
  int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id, int role);
  int SetEndpointVisibility(IntPtr a, int b);
}

[ComImport, Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")]
class PolicyConfigClient {}

public static class WallAudio {
  public static string DefaultOutput() {
    var e = (IMMDeviceEnumerator)new MMDeviceEnumerator();
    IMMDevice d;
    if (e.GetDefaultAudioEndpoint(0, 0, out d) != 0 || d == null) return "";
    string id;
    d.GetId(out id);
    return id ?? "";
  }
  public static void SetDefault(string id) {
    var p = (IPolicyConfig)new PolicyConfigClient();
    for (int role = 0; role < 3; role++) p.SetDefaultEndpoint(id, role);
  }
}
'@

if ($cmd -eq 'set') {
  [WallAudio]::SetDefault($id)
  'ok'
  exit
}

# output endpoints are {0.0.0.*}; the device ID is the part after SWD\MMDEVAPI\
$current = [WallAudio]::DefaultOutput()
$list = @(Get-PnpDevice -Class AudioEndpoint -Status OK -ErrorAction SilentlyContinue |
  Where-Object { $_.InstanceId -match '\{0\.0\.0\.' } |
  ForEach-Object {
    $devId = $_.InstanceId -replace '^SWD\\MMDEVAPI\\', ''
    [pscustomobject]@{ id = $devId; name = $_.FriendlyName; default = ($devId -ieq $current) }
  })
ConvertTo-Json -InputObject $list -Compress
