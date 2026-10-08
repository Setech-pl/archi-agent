#!/usr/bin/env python3
"""Encode genuine ScreenCaptureKit frames, preserving their measured order and timing."""
from pathlib import Path
import json,subprocess,hashlib,sys
raw,media,evidence=map(Path,sys.argv[1:]);media.mkdir(parents=True,exist_ok=True);evidence.mkdir(parents=True,exist_ok=True)
record=json.loads((raw/'recording.json').read_text());assert record['status']=='PASS'
scanner=raw/'crop-pickers';subprocess.run(['swiftc','scripts/docs/crop-pickers.swift','-o',str(scanner)],check=True)
outputs=[]
for scenario in record['scenarios']:
 name=scenario['name'];folder=raw/name;frames=json.loads((folder/'frames.json').read_text())
 detected=set(json.loads(subprocess.check_output([str(scanner),str(folder)],text=True)))
 # Include adjacent half-second samples: native sheets can be translucent while presenting/dismissing.
 indexes={i for i,f in enumerate(frames) if f['file'] in detected}
 native={frames[j]['file'] for i in indexes for j in range(max(0,i-2),min(len(frames),i+3))}
 processed=folder/'cropped';processed.mkdir(exist_ok=True)
 for frame in frames:
  if frame['file'] in native:
   subprocess.run(['ffmpeg','-y','-v','error','-i',str(folder/frame['file']),'-vf','crop=680:444:320:160,scale=1120:-2,pad=1120:760:(ow-iw)/2:(oh-ih)/2:color=white','-frames:v','1',str(processed/frame['file'])],check=True)
 concat=folder/'frames.ffconcat';lines=['ffconcat version 1.0']
 for i,frame in enumerate(frames):
  lines.append("file '"+str((processed if frame['file'] in native else folder)/frame['file'])+"'")
  duration=frames[i+1]['seconds']-frame['seconds'] if i+1<len(frames) else .7
  lines.append(f'duration {duration:.6f}')
 lines.append("file '"+str((processed if frames[-1]['file'] in native else folder)/frames[-1]['file'])+"'");concat.write_text('\n'.join(lines)+'\n')
 target=media/(name+'.gif')
 cmd=['ffmpeg','-y','-v','error','-f','concat','-safe','0','-i',str(concat),'-filter_complex','[0:v]fps=1,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle','-loop','0',str(target)]
 subprocess.run(cmd,check=True)
 # A static actual middle frame, copied without redrawing the UI.
 wanted={'choose-pack-generate':'diagram and report','save-original-pair':'native confirmation','documents-review-save':'immutable file preview'}[name];time=next(e['seconds'] for e in scenario['events'] if e['name']==wanted)+1;mid=min(frames,key=lambda f:abs(f['seconds']-time));(media/(name+'.png')).write_bytes(((processed if mid['file'] in native else folder)/mid['file']).read_bytes())
 probe=subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_entries','stream=width,height,nb_read_frames,duration','-of','json',str(target)],text=True)
 subprocess.run(['ffmpeg','-v','error','-i',str(target),'-f','null','-'],check=True)
 info=json.loads(probe)['streams'][0];assert int(info['nb_read_frames'])>1;assert 10<float(info['duration'])<35;assert target.stat().st_size<5*1024*1024
 # Decode first/middle/last for visual verification of the final GIF.
 for label,index in [('first',0),('middle',int(info['nb_read_frames'])//2),('last',int(info['nb_read_frames'])-1)]:
  subprocess.run(['ffmpeg','-y','-v','error','-i',str(target),'-vf',f'select=eq(n\\,{index})','-frames:v','1',str(evidence/(name+'-'+label+'.png'))],check=True)
 def item(file):return {'path':str(file),'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}
 outputs.append({'scenario':name,'gif':item(target),'preview':item(media/(name+'.png')),'decoded':info,'status':'PASS','rawFrames':len(frames),'nativePickerFramesDetected':len(detected),'nativePickerFramesCropped':len(native),'nativeTransitionPaddingRawFrames':2,'crop':'native picker content only: x320 y160 w680 h444, scaled/padded to 1120x760; personal sidebar and two adjacent raw transition samples excluded, actual UI pixels retained','previewCaptureSeconds':mid['seconds'],'capture':'ScreenCaptureKit, desktopIndependentWindow filtered by isolated VS Code PID; genuine native sheets','timing':'measured frame intervals sampled to 1 fps (up to 1 s rounding); no acceleration or reordered actions'})
 manifest={'sourceCommit':'a76b15ca822364810edb0298852db70437f73e9d','sourceState':'FU-01 product plus uncommitted DOC1 documentation/license/package tooling; executable bundle parity checked separately','recordedVsix':{'name':Path(record['vsix']).name,'sha256':record['vsixSha256'],'bytes':Path(record['vsix']).stat().st_size},'encoding':{'fps':1,'paletteColors':96,'dither':'none','loop':0,'dimensions':[1120,760],'codec':'GIF','speedup':False},'syntheticTransport':True,'generationRequests':record['calls'],'modelListRequests':record['lists'],'platform':record['platform'],'arch':record['arch'],'recordingHarnessSha256':hashlib.sha256(Path('scripts/docs/record-ui.mjs').read_bytes()).hexdigest(),'outputs':outputs,'OWNER_SMOKE':'DEFERRED'}
 (media/'provenance.json').write_text(json.dumps(manifest,indent=2)+'\n');(evidence/'media-check.json').write_text(json.dumps(manifest,indent=2)+'\n')
 (evidence/'recording.json').write_text(json.dumps(record,indent=2)+'\n')
 print(name,info,target.stat().st_size,flush=True)
