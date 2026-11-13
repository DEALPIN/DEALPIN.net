/* Minimal QR encoder (byte mode, error correction L, versions 1-10). QR.svg(text) returns an SVG string. */
const QR=(()=>{
  const mul=(x,y)=>{let z=0;for(let i=7;i>=0;i--){z=(z<<1)^((z>>>7)*0x11D);z^=((y>>>i)&1)*x}return z};
  const rsDiv=n=>{const r=Array(n).fill(0);r[n-1]=1;let root=1;for(let i=0;i<n;i++){for(let j=0;j<n;j++){r[j]=mul(r[j],root);if(j+1<n)r[j]^=r[j+1]}root=mul(root,2)}return r};
  const rsRem=(data,div)=>{const r=div.map(()=>0);for(const b of data){const f=b^r.shift();r.push(0);div.forEach((c,i)=>r[i]^=mul(c,f))}return r};
  const EC=[0,7,10,15,20,26,18,20,24,30,18],NB=[0,1,1,1,1,1,2,2,2,2,4];
  const raw=v=>{let n=(16*v+128)*v+64;if(v>=2){const a=Math.floor(v/7)+2;n-=(25*a-10)*a-55}if(v>=7)n-=36;return n>>3};
  const cap=v=>raw(v)-EC[v]*NB[v],lb=v=>v<10?8:16;
  const MK=[(x,y)=>(x+y)%2===0,(x,y)=>y%2===0,(x,y)=>x%3===0,(x,y)=>(x+y)%3===0,(x,y)=>(Math.floor(x/3)+Math.floor(y/2))%2===0,(x,y)=>x*y%2+x*y%3===0,(x,y)=>(x*y%2+x*y%3)%2===0,(x,y)=>((x+y)%2+x*y%3)%2===0];
  function matrix(text){
    const data=[...new TextEncoder().encode(text)];let v=1;
    while(v<=10&&data.length*8+4+lb(v)>cap(v)*8)v++;
    if(v>10)throw new Error('That link is too long for a QR code.');
    const bits=[],put=(x,n)=>{for(let i=n-1;i>=0;i--)bits.push((x>>>i)&1)};
    put(4,4);put(data.length,lb(v));data.forEach(b=>put(b,8));put(0,Math.min(4,cap(v)*8-bits.length));while(bits.length%8)bits.push(0);
    const cw=[];for(let i=0;i<bits.length;i+=8)cw.push(parseInt(bits.slice(i,i+8).join(''),2));
    for(let p=0xEC;cw.length<cap(v);p^=0xEC^0x11)cw.push(p);
    const nb=NB[v],ec=EC[v],rc=raw(v),ns=nb-rc%nb,sl=Math.floor(rc/nb),div=rsDiv(ec),blocks=[];
    for(let i=0,k=0;i<nb;i++){const len=sl-ec+(i<ns?0:1),d=cw.slice(k,k+len);k+=len;const e=rsRem(d,div);if(i<ns)d.push(0);blocks.push(d.concat(e))}
    const all=[];for(let i=0;i<blocks[0].length;i++)blocks.forEach((b,j)=>{if(i!==sl-ec||j>=ns)all.push(b[i])});
    const n=v*4+17,M=Array.from({length:n},()=>Array(n).fill(false)),F=Array.from({length:n},()=>Array(n).fill(false));
    const set=(x,y,d)=>{M[y][x]=d;F[y][x]=true};
    for(let i=0;i<n;i++){set(6,i,i%2===0);set(i,6,i%2===0)}
    const fin=(cx,cy)=>{for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const d=Math.max(Math.abs(dx),Math.abs(dy)),x=cx+dx,y=cy+dy;if(x>=0&&x<n&&y>=0&&y<n)set(x,y,d!==2&&d!==4)}};
    fin(3,3);fin(n-4,3);fin(3,n-4);
    const ap=[];if(v>1){const na=Math.floor(v/7)+2,st=Math.ceil((v*4+4)/(na*2-2))*2;ap.push(6);for(let p=n-7,c=1;c<na;c++,p-=st)ap.splice(1,0,p)}
    ap.forEach((a,i)=>ap.forEach((b,j)=>{if((i===0&&j===0)||(i===0&&j===ap.length-1)||(i===ap.length-1&&j===0))return;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)set(a+dx,b+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1)}));
    const fmt=m=>{const d=8|m;let r=d;for(let i=0;i<10;i++)r=(r<<1)^((r>>>9)*0x537);const b=((d<<10)|r)^0x5412,g=i=>((b>>>i)&1)!==0;
      for(let i=0;i<=5;i++)set(8,i,g(i));set(8,7,g(6));set(8,8,g(7));set(7,8,g(8));for(let i=9;i<15;i++)set(14-i,8,g(i));
      for(let i=0;i<8;i++)set(n-1-i,8,g(i));for(let i=8;i<15;i++)set(8,n-15+i,g(i));set(8,n-8,true)};
    fmt(0);
    if(v>=7){let r=v;for(let i=0;i<12;i++)r=(r<<1)^((r>>>11)*0x1F25);const b=(v<<12)|r;for(let i=0;i<18;i++){const a=n-11+i%3,c=Math.floor(i/3),d=((b>>>i)&1)!==0;set(a,c,d);set(c,a,d)}}
    let k=0;for(let r=n-1;r>=1;r-=2){if(r===6)r=5;for(let vt=0;vt<n;vt++)for(let j=0;j<2;j++){const x=r-j,y=((r+1)&2)===0?n-1-vt:vt;if(!F[y][x]&&k<all.length*8){M[y][x]=((all[k>>3]>>>(7-(k&7)))&1)!==0;k++}}}
    const app=m=>{for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(!F[y][x]&&MK[m](x,y))M[y][x]=!M[y][x]};
    const pen=()=>{let p=0;for(let t=0;t<2;t++)for(let a=0;a<n;a++){let run=1;for(let b=1;b<n;b++){const c=t?M[b][a]:M[a][b],q=t?M[b-1][a]:M[a][b-1];if(c===q){run++;if(run===5)p+=3;else if(run>5)p++}else run=1}}
      for(let t=0;t<2;t++)for(let a=0;a<n;a++){const l=Array.from({length:n},(_,b)=>+(t?M[b][a]:M[a][b])).join('');for(let i=0;i+11<=n;i++){const w=l.slice(i,i+11);if(w==='10111010000'||w==='00001011101')p+=40}}
      for(let y=0;y<n-1;y++)for(let x=0;x<n-1;x++){const c=M[y][x];if(c===M[y][x+1]&&c===M[y+1][x]&&c===M[y+1][x+1])p+=3}
      const d=M.flat().filter(Boolean).length;return p+Math.floor(Math.abs(d*20-n*n*10)/(n*n))*10};
    let best=0,bp=1e9;for(let m=0;m<8;m++){if(m===2)continue;app(m);fmt(m);const p=pen();if(p<bp){bp=p;best=m}app(m)}
    app(best);fmt(best);return M;
  }
  function svg(t){const M=matrix(t),n=M.length,b=4;let p='';M.forEach((r,y)=>r.forEach((c,x)=>{if(c)p+=`M${x+b} ${y+b}h1v1h-1z`}));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n+2*b} ${n+2*b}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${p}" fill="#000"/></svg>`}
  return{matrix,svg};
})();
