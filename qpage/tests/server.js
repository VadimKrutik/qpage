const http=require('http'),fs=require('fs'),path=require('path');
const root=process.argv[2];const port=+process.argv[3]||8080;
const toml=fs.readFileSync(path.join(root,'_headers'),'utf8');
const csp=toml.match(/Content-Security-Policy: (.+)/)[1];
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
http.createServer((q,r)=>{let p=decodeURIComponent(new URL(q.url,'http://x').pathname);if(p.endsWith('/'))p+='index.html';
const f=path.join(root,p);if(!f.startsWith(root)||!fs.existsSync(f)){r.writeHead(404);return r.end('nf')}
r.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream','Content-Security-Policy':csp});fs.createReadStream(f).pipe(r)}).listen(port);
