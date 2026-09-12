(async function () {
  const send = payload => parent.postMessage({ channel: 'laq-assembly', ...payload }, location.origin);
  try {
    const params = new URLSearchParams(location.search);
    const name = params.get('id');
    if (!name || !/^[a-z0-9-]+$/.test(name)) throw new Error('Unknown guide');
    const guide = params.has('embedded') ? await new Promise((resolve, reject) => {
      const receive = event => {
        if (event.origin !== location.origin || event.source !== parent || event.data?.channel !== 'laq-assembly' || event.data.command !== 'load-guide') return;
        clearInterval(request);clearTimeout(timeout);window.removeEventListener('message', receive);resolve(event.data.guide);
      };
      window.addEventListener('message', receive);
      const request = setInterval(() => send({ type: 'guide-request' }), 100);
      const timeout = setTimeout(() => { clearInterval(request);window.removeEventListener('message', receive);reject(new Error('Guide unavailable')); }, 10000);
      send({ type: 'guide-request' });
    }) : await (async () => {
      const response = await fetch(`../${name}/guide.json`);
      if (!response.ok) throw new Error('Guide unavailable');
      return response.json();
    })();
    window.__LaQLibraryGuide = guide;
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'unit-instructions.js';script.onload = resolve;script.onerror = reject;document.body.append(script);
    });
    if (!window.LaQLibraryViewer) throw new Error('Renderer unavailable');
    document.getElementById('loading').hidden = true;
    document.body.classList.add('ready');
    document.querySelector('.hint').textContent = '1本の ゆびで まわす・2本の ゆびで 大きく／小さく';
    document.getElementById('fit').textContent = 'ぜんたいを見る';
    document.getElementById('guide-prev').textContent = '← まえの ばしょ';
    document.getElementById('guide-next').textContent = 'つぎの ばしょ →';
    let imagesStarted = false;
    window.addEventListener('message', event => {
      if (event.origin !== location.origin || event.source !== parent || event.data?.channel !== 'laq-assembly') return;
      if (event.data.command === 'replace-guide') {
        try { window.LaQLibraryViewer.replaceGuide(event.data.guide);send({type:'updated'}); } catch(error) {send({type:'error',message:error.message});}
      }
      if (event.data.command === 'select') window.LaQLibraryViewer.selectPieces(event.data.ids || []);
      if (event.data.command === 'show') {
        try {
          window.LaQLibraryViewer.show(event.data);send({ type: 'shown', key: event.data.key });
          if (!imagesStarted) {
            imagesStarted = true;
            setTimeout(() => window.LaQLibraryViewer.generateImages(images => send({ type: 'images', images })).catch(() => {}), 250);
          }
        }
        catch { send({ type: 'error' }); }
      }
    });
    let lastHeight = 0;
    new ResizeObserver(() => {
      const height = Math.ceil(document.querySelector('main').getBoundingClientRect().height);
      if (height !== lastHeight && height > 0) { lastHeight = height;send({ type: 'height', height }); }
    }).observe(document.querySelector('main'));
    window.addEventListener('laq-piece-selected', event => send({type:'selected',id:event.detail.id}));
    send({ type: 'ready', images: {} });
    document.querySelectorAll('canvas').forEach(canvas => canvas.addEventListener('webglcontextlost', event => {event.preventDefault();send({type:'error'});}));
  } catch {
    document.getElementById('loading').textContent = '図が よみこめませんでした。もういちど 開いてね。';
    send({ type: 'error' });
  }
})();
