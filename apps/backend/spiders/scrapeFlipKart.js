import { chromium } from 'playwright';
import UserAgent from 'user-agents';
import fs from 'fs';
import e from 'express';
// Configuration constants
const DEFAULT_TIMEOUT = 15000; // 10 seconds
const SCROLL_TIMEOUT = 1000; // 1 second
const MAX_RETRIES = 3;
const CONCURRENT_PRODUCT_LIMIT = 20; // Number of products to process concurrently

async function runJob(job, jobId, url, pincode) {
  const browser = await chromium.launch({
    headless: true // Run headless for better performance
  });
  try {
    const userAgent = new UserAgent({ deviceCategory: 'desktop' });
    const randomUserAgent = userAgent.toString();
    // Create browser context with optimized settings
    const context = await browser.newContext({
      userAgent: randomUserAgent,
      viewport: { width: 1280, height: 720 },
      bypassCSP: true
    });

    // Block unnecessary resources to improve performance
    // await context.route(
    //   /\.(png|jpg|jpeg|gif|svg|woff|woff2|ttf|otf|css)$/i,
    //   (route) => route.abort()
    // );
    // await context.route(/\/(analytics|tracking|advertisement|ad)\//i, (route) =>
    //   route.abort()
    // );

    const page = await context.newPage();
    page.setDefaultTimeout(DEFAULT_TIMEOUT);
    await page.goto(url);
    await page.waitForLoadState('domcontentloaded');

    const categoryElement = page.locator(
      '#container > div > div:nth-child(3) > div > div:nth-child(2) > div > div > div:has(h1) > div > div:last-child:has(svg)'
    );
    let catName = '';
    let filename = `flipkart-${pincode}-food-products-products`;
    if ((await categoryElement.count()) > 0) {
      catName = await categoryElement.textContent();
      catName = catName
        .replace(',', ' ')
        .replace(' ', '-')
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/[&]/g, 'and') // Replace '&' with 'and'
        .replace(/[^a-zA-Z0-9-_]/g, '') // Remove any other special characters
        .toLowerCase();
      filename = `flipkar-${pincode}-${catName}-products`;
    }
    const productElements = await page
      .locator(
        'div#container > div > div:nth-child(3) > div > div:nth-child(2) div[data-id]'
      )
      .all();
    job.attrs.data.progress = 5;
    await job.save();
    console.log(`Founded ${productElements.length}`);
    const allProducts = [];
    let i = 0;
    while (true) {
      i++;
      // make a set to hash product names
      const s = new Set();
      for (const productElement of productElements) {
        await productElement.scrollIntoViewIfNeeded();
        let title = '';
        let imageUrl = '';
        const variants = [];
        let baseVariantUrl = '';
        try {
          let titleElement = productElement.locator('div a:nth-of-type(2)');
          title = await titleElement.getAttribute('title');
          if (s.has(title)) {
            break;
          } else {
            s.add(title);
          }
          const imgElement = productElement.locator('div a:nth-of-type(1) img');
          if ((await imgElement.count()) > 0) {
            imageUrl = await imgElement.getAttribute('src');
          }
          baseVariantUrl += await titleElement.getAttribute('href');

          const salePrice = await productElement
            .locator('div a:nth-of-type(3) > div:first-child > div:first-child')
            .textContent();
          let mrp = '';
          try {
            let mrpElement = productElement.locator(
              'div a:nth-of-type(3) > div:first-child > div:nth-child(2)'
            );
            mrp = await mrpElement.textContent();
          } catch (e) {
            console.error('no price (mrp = price)');
            mrp = salePrice;
          }
          const quantityElement = productElement.locator(
            'div a:nth-of-type(2) + div:not(:has(*))'
          );
          let quantity = '';
          if ((await quantityElement.count()) > 0) {
            quantity = (await quantityElement.textContent())
              .replace('Quantity:', '')
              .trim();
          }
          // if there's no choices nor quantity ( go with the one under the title)
          // now we need to get the variants ( quantity and price)
          await productElement.hover();
          await page.waitForTimeout(1000);
          const lastDiv = productElement.locator('> div > div:last-child');

          if ((await lastDiv.count()) > 0) {
            const tx = await lastDiv.textContent();
            if (tx.toLowerCase().includes('quantity')) {
              quantity = tx.replace('Quantity:', '').trim();
              variants.push({
                quantity: quantity,
                // replace any char that's not a number nor , nor .
                mrp: mrp.replace(/[^\d,.]/g, ''),
                price: salePrice.replace(/[^\d,.]/g, ''),
                variantUrl: `https://www.flipkart.com${baseVariantUrl}`
              });
            } else if (tx.toLowerCase().includes('more choices')) {
              await lastDiv.click({ force: true });
              await page.waitForTimeout(1000);
              const choiceDiv = page.locator(
                'div#container > div:first-child > div:first-child > div:first-child'
              );
              await page.waitForTimeout(3000);
              const choices = choiceDiv.locator(
                '> div > div:last-child > div > div > div:first-child > div:first-child > div'
              );
              if ((await choices.count()) > 0) {
                const choiceElements = await choices.all();
                for (const choiceElement of choiceElements) {
                  try {
                    const tx = await choiceElement.textContent();
                    if (tx.toLowerCase().includes('unavailable')) {
                      continue;
                    }
                    const choiceLink = await choiceElement
                      .locator('div a')
                      .getAttribute('href');
                    const quantityElement = choiceElement.locator(
                      'div > a > div:nth-child(2) >  span:first-child'
                    );
                    let quantity = '';
                    if ((await quantityElement.count()) > 0) {
                      quantity = (await quantityElement.textContent())
                        .replace('Quantity:', '')
                        .trim();
                    }
                    const priceElement = choiceElement.locator(
                      'div a div:nth-child(2) > div > div > div:first-child'
                    );
                    let price = '';
                    if ((await priceElement.count()) > 0) {
                      price = await priceElement.textContent();
                    }
                    const mrpElement = choiceElement.locator(
                      'div a div:nth-child(2) > div > div > div:nth-child(2)'
                    );
                    let mrp = '';
                    if ((await mrpElement.count()) > 0) {
                      mrp = await mrpElement.textContent();
                    } else {
                      mrp = price;
                    }

                    variants.push({
                      quantity: quantity,
                      price: price.replace(/[^\d,.]/g, ''),
                      mrp: mrp.replace(/[^\d,.]/g, ''),
                      variantUrl: `https://www.flipkart.com${choiceLink}`
                    });
                  } catch (e) {
                    console.error(
                      `error happened while getting data of product ${title} , message-> ${e}`
                    );
                    continue;
                  }
                }
              }
              await choiceDiv.locator('button').click({ force: true });
            } else {
              variants.push({
                quantity: quantity,
                // replace any char that's not a number nor , nor .
                mrp: mrp.replace(/[^\d,.]/g, ''),
                price: salePrice.replace(/[^\d,.]/g, ''),
                variantUrl: `https://www.flipkart.com${baseVariantUrl}`
              });
            }
          }
        } catch (e) {
          console.error(
            `error happened while getting data of product ${title} , message-> ${e}`
          );
          continue;
        }
        allProducts.push({
          title,
          variants,
          imageUrl: imageUrl,
          url: `https://www.flipkart.com${baseVariantUrl}`,
          pincode: Number(pincode)
        });
        job.attrs.data.progress = (15 + i) % 100;
        job.attrs.data.total_products = allProducts.length;
        await job.save();
      }
      const totalProducts = await page.locator('h1 + span').textContent();
      console.log(`totalProducts showing: ${totalProducts}`);
      await page.click('a:has-text("Next")');
      // wait for the page number in the link to change
      const oldUrl = page.url();
      await page.waitForURL((url) => url !== oldUrl);

      await page.waitForTimeout(3000);

      const newTotalProducts = await page.locator('h1 + span').textContent();
      console.log(`newTotalProducts showing: ${newTotalProducts}`);
      if (totalProducts === newTotalProducts) {
        console.log(`broke from equality`);
        break;
      }
    }
    console.log(`allProducts: ${allProducts.length}`);
    job.attrs.data.progress = 100;
    job.attrs.data.total_products = allProducts.length;
    await job.save();
    return [allProducts, filename];
  } catch (error) {
    console.error(`Job  with ID : ${jobId}failed with error: ${error.message}`);
    // Return any products collected so far
    return [[], null];
  } finally {
    await browser.close();
    const endTime = performance.now();
    // const duration = (endTime - startTime) / 1000;
    // console.log(`Job completed in ${duration.toFixed(2)} seconds`);
  }
}

export async function main(job, jobId, url, pincode) {
  return await runJob(job, jobId, url, pincode);
}
