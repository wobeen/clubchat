document.addEventListener('click',e=>{const button=e.target.closest('[data-screen]');if(!button)return;document.querySelectorAll('[data-screen]').forEach(b=>b.classList.toggle('active',b===button));document.querySelector('#phone-frame').src=button.dataset.screen==='room'?'/android?capsule=festival&designPreview=1':'/android?designPreview=1';});
const viewport=document.querySelector('.desktop-viewport');
new ResizeObserver(()=>{const scale=viewport.clientWidth/1280;viewport.querySelector('iframe').style.transform=`scale(${scale})`;viewport.style.height=`${820*scale}px`;}).observe(viewport);
