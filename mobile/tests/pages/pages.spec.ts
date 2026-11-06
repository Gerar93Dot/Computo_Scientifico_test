import {test,expect} from '@playwright/test';
test('publicación en subcarpeta: modo personal, OCR, reparto y recarga sin red',async({page,context})=>{
 test.setTimeout(120000);
 const failed:string[]=[];page.on('response',r=>{if(r.status()>=400)failed.push(r.url());});
 await page.goto('./');await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
 await page.getByRole('button',{name:'Grupo',exact:true}).click();await expect(page.getByRole('heading',{name:'Prueba sin cuentas'})).toBeVisible();await expect(page.getByRole('button',{name:'Crear grupo compartido'})).toHaveCount(0);
 await page.getByLabel('Nombre',{exact:true}).fill('Ana');await page.getByRole('button',{name:'Añadir',exact:true}).click();await expect(page.locator('.members')).toContainText('Ana');
 await page.getByRole('button',{name:'Ticket',exact:true}).click();await page.getByLabel('Abrir galería',{exact:true}).setInputFiles('tests/receipt.png');await expect(page.getByLabel('Producto 1',{exact:true})).toHaveValue(/PAN/i,{timeout:90000});
 await page.getByLabel('¿Quién pagó?').selectOption({label:'Ana'});for(const button of await page.getByRole('button',{name:'Todos',exact:true}).all())await button.click();await page.getByLabel(/Revisé nombres/).check();await page.getByRole('button',{name:'Guardar y repartir'}).click();await expect(page.locator('.hero-amount')).toContainText('55.50');
 const manifest=await page.evaluate(async()=>{const url=document.querySelector<HTMLLinkElement>('link[rel=manifest]')!.href;return {url,data:await (await fetch(url)).json()};});expect(manifest.url).toContain('/Computo_Scientifico_test/manifest.webmanifest');expect(manifest.data.start_url).toBe('./');
 await context.setOffline(true);await page.reload();await expect(page.locator('.hero-amount')).toContainText('55.50');expect(failed).toEqual([]);await context.setOffline(false);
});
