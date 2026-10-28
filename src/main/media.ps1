# Streams the current Windows media session (Spotify, Apple Music, browsers, ...) as JSON
# lines on stdout, plus the track's cover as a separate {thumb} line when the track changes, and takes commands on stdin: toggle | play | pause | next | prev | seek <sec> | shuffle | repeat
# Uses Windows' Global System Media Transport Controls; no installs needed.

$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]

$asTaskOp = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
$asTaskAction = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction'
} | Select-Object -First 1

function Await($op, [Type]$type) {
  $t = $asTaskOp.MakeGenericMethod($type).Invoke($null, @($op))
  $null = $t.Wait(3000)
  if ($t.IsCompleted) { return $t.Result }
  return $null
}

$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput())
$pending = $reader.ReadLineAsync()
$lastOut = ''
$lastKey = ''
$tryKey = ''
$prevThumb = ''
$tries = 0

# The stream object only works when called through its interface (via reflection).
function Thumb($props) {
  try {
    if (-not $props.Thumbnail) { return '' }
    $ras = Await ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    if (-not $ras) { return '' }
    $irs = [Windows.Storage.Streams.IRandomAccessStream]
    $size = [uint32]$irs.GetProperty('Size').GetValue($ras)
    if ($size -le 0) { return '' }
    $in = $irs.GetMethod('GetInputStreamAt').Invoke($ras, @([uint64]0))
    $dr = New-Object Windows.Storage.Streams.DataReader -ArgumentList $in
    $n = Await ($dr.LoadAsync($size)) ([uint32])
    $bytes = New-Object byte[] $n
    $dr.ReadBytes($bytes)
    $mime = 'image/jpeg'
    if ($bytes.Length -gt 3 -and $bytes[0] -eq 0x89) { $mime = 'image/png' }
    return "data:$mime;base64," + [Convert]::ToBase64String($bytes)
  } catch { return '' }
}

while ($true) {
  $session = $mgr.GetCurrentSession()

  if ($pending.IsCompleted) {
    $cmd = "$($pending.Result)".Trim()
    if ($pending.Result -eq $null) { break }   # parent closed stdin: exit
    $pending = $reader.ReadLineAsync()
    if ($session -and $cmd) {
      $parts = $cmd.Split(' ')
      switch ($parts[0]) {
        'toggle' { $null = $session.TryTogglePlayPauseAsync() }
        'play' { $null = $session.TryPlayAsync() }
        'pause' { $null = $session.TryPauseAsync() }
        'next' { $null = $session.TrySkipNextAsync() }
        'prev' { $null = $session.TrySkipPreviousAsync() }
        'seek' { $null = $session.TryChangePlaybackPositionAsync([long]([double]$parts[1] * 10000000)) }
        'shuffle' { $s = $session.GetPlaybackInfo().IsShuffleActive; $null = $session.TryChangeShuffleActiveAsync(-not $s) }
        'repeat' {
          $r = [int]$session.GetPlaybackInfo().AutoRepeatMode
          $null = $session.TryChangeAutoRepeatModeAsync([Windows.Media.MediaPlaybackAutoRepeatMode](($r + 1) % 3))
        }
      }
      Start-Sleep -Milliseconds 150
    }
  }

  $out = @{ playing = $false; active = $false }
  if ($session) {
    $props = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    $info = $session.GetPlaybackInfo()
    $tl = $session.GetTimelineProperties()
    $key = "$($session.SourceAppUserModelId)|$($props.Title)|$($props.Artist)"
    if ($key -ne $lastKey) {
      if ($key -ne $tryKey) { $tryKey = $key; $tries = 0 }
      $thumb = Thumb $props
      $tries++
      # right after a track change, players often still serve the previous cover: wait for a new one
      $stale = $thumb -and $prevThumb -and ($thumb -eq $prevThumb) -and ($tries -lt 8)
      if ($thumb -and -not $stale) {
        [Console]::Out.WriteLine((@{ thumb = $thumb; key = $key } | ConvertTo-Json -Compress)); [Console]::Out.Flush()
        $prevThumb = $thumb
        $lastKey = $key
      } elseif ($tries -ge 8) { $lastKey = $key }
    }
    $out = @{
      active    = $true
      app       = "$($session.SourceAppUserModelId)"
      title     = "$($props.Title)"
      artist    = "$($props.Artist)"
      album     = "$($props.AlbumTitle)"
      playing   = ([int]$info.PlaybackStatus -eq 4)
      status    = [int]$info.PlaybackStatus
      shuffle   = [bool]$info.IsShuffleActive
      repeat    = [int]$info.AutoRepeatMode
      position  = $tl.Position.TotalSeconds
      duration  = ($tl.EndTime - $tl.StartTime).TotalSeconds
      updated   = $tl.LastUpdatedTime.ToUnixTimeMilliseconds()
      canSeek   = [bool]$info.Controls.IsPlaybackPositionEnabled
      canShuffle = [bool]$info.Controls.IsShuffleEnabled
      canRepeat = [bool]$info.Controls.IsRepeatEnabled
      canNext   = [bool]$info.Controls.IsNextEnabled
      canPrev   = [bool]$info.Controls.IsPreviousEnabled
    }
  }
  $json = ($out | ConvertTo-Json -Compress)
  if ($json -ne $lastOut) {
    $lastOut = $json
    [Console]::Out.WriteLine($json)
    [Console]::Out.Flush()
  }
  Start-Sleep -Milliseconds 400
}
