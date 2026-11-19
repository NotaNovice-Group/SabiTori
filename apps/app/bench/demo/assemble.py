"""Turn record.mjs frames (frames.json) into an MP4 at 30 fps, dropping the cut interval. Run in the out dir."""
import json,sys,subprocess
d=json.load(open('frames.json'));F=d['frames'];M=d['marks']
cuts=[(M['ocrCutFrom'],M['ocrCutTo'])]
keep=[f for f in F if M['start']<=f['t']<=M['end'] and not any(a<f['t']<b for a,b in cuts)]
lines=[]
for i,f in enumerate(keep):
  nt=keep[i+1]['t'] if i+1<len(keep) else M['end']
  dur=nt-f['t']-sum(b-a for a,b in cuts if f['t']<=a and nt>=b)
  lines.append(f"file '{f['file']}'\nduration {max(dur,0.001):.4f}")
lines.append(f"file '{keep[-1]['file']}'")
open('list.txt','w').write('\n'.join(lines)+'\n')
total=M['end']-M['start']-sum(b-a for a,b in cuts)
print('total',round(total,2))
out=sys.argv[1] if len(sys.argv)>1 else 'demo.mp4'
subprocess.run(['ffmpeg','-y','-loglevel','error','-f','concat','-safe','0','-i','list.txt','-vf','fps=30,format=yuv420p','-c:v','libx264','-preset','slow','-crf','18','-movflags','+faststart',out],check=True)
