// Developer-only deterministic scan generator. Requires a verified extracted Full extension.
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const [fullArg,outArg]=process.argv.slice(2),out=path.resolve(outArg);
const require=createRequire(path.join(path.resolve(fullArg),'ux2-ocr','convert.mjs'));
const {createCanvas}=require('@napi-rs/canvas');
for(const [lang,lines] of [['en',['Mission Control','Operator supervises missions.','Mission Planning stores plans in Archive.','Telemetry publishes events to Alarms.']],['pl',['Centrum sterowania misją','Operator nadzoruje misje.','Planowanie misji zapisuje plany w Archiwum.','Telemetria wysyła zdarzenia do Alarmów.']]]){
 const c=createCanvas(1700,2200),ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1700,2200);ctx.fillStyle='#111';ctx.font='42px Arial';lines.forEach((s,i)=>ctx.fillText(s,120,220+i*100));
 const jpg=c.toBuffer('image/jpeg',92);const stream=Buffer.from('q 612 0 0 792 0 0 cm /Im1 Do Q');
 const objects=[Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>'),Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 1700 /Height 2200 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`),jpg,Buffer.from('\nendstream')]),Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`),stream,Buffer.from('\nendstream')])];
 const chunks=[Buffer.from('%PDF-1.4\n')],offsets=[0];let offset=chunks[0].length;
 for(const [i,obj] of objects.entries()){offsets.push(offset);const b=Buffer.concat([Buffer.from(`${i+1} 0 obj\n`),obj,Buffer.from('\nendobj\n')]);chunks.push(b);offset+=b.length;}
 chunks.push(Buffer.from(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`));
 mkdirSync(path.join(out,lang),{recursive:true});writeFileSync(path.join(out,lang,'mission-scan.pdf'),Buffer.concat(chunks));writeFileSync(path.join(out,lang,'mission-scan.png'),c.toBuffer('image/png'));writeFileSync(path.join(out,lang,'mission-scan-transcript.txt'),lines.join('\n')+'\n');
}
