import UserAgent from 'user-agents';
import { chromium } from 'playwright-extra';

import stealth from 'puppeteer-extra-plugin-stealth';

chromium.use(stealth());
async function runJob(job, jobId, url, pincode) {
  const browser = await chromium.launch({
    headless: process.env.SPIDERS_HEADLESS_MODE === 'true',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-extensions',
      '--disable-infobars',
      '--mute-audio',
      '--disable-background-networking'
    ]
  });

  // Apply stealth plugin

  const userAgent = new UserAgent({ deviceCategory: 'desktop' }).toString();
  const context = await browser.newContext({
    userAgent,
    viewport: { width: 1280, height: 720 },
    bypassCSP: true
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en']
    });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });

    // Spoof WebRTC
    Object.defineProperty(navigator, 'connection', {
      get: () => ({ effectiveType: '4g' })
    });
  });
  const page = await context.newPage();
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  await context.addInitScript(() => {
    Intl.DateTimeFormat = class extends Intl.DateTimeFormat {
      constructor(locale, options) {
        super('en-US', options);
      }
    };
    Object.defineProperty(Intl.DateTimeFormat.prototype, 'resolvedOptions', {
      value: () => ({ timeZone: 'America/New_York' })
    });
  });
  try {
    // page.setDefaultTimeout(60000 * 3);
    await page.route(/(png|jpeg|jpg|svg)$/, (route) => route.abort());
    let headers = {};
    await page.goto(url);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector("div[class*='LocationBar__SubtitleContainer']");
    // Handle location input (Pincode)
    await page.waitForSelector("div[class*='LocationBar__SubtitleContainer']");
    const pincodeButton = page
      .locator("div[class*='LocationBar__SubtitleContainer']")
      .first()
      .dispatchEvent('click');
    await page.waitForSelector("input[name*='select-locality']");
    let pincodeInput = page.locator("input[name*='select-locality']").first();
    await pincodeInput.pressSequentially(pincode, { delay: 1000 });
    await pincodeInput.press('Enter');

    await page.waitForSelector(
      'div.address-container-v1 div[class*="LocationDetailContainer"]'
    );
    const pinCode = page
      .locator(
        `div.address-container-v1 div[class*="LocationDetailContainer"]:has-text("${pincode}")`
      )
      .first();
    await page.route(/\/v1\/layout\/listing_widgets\?.*/, (route) => {
      if (Object.keys(headers).length === 0) {
        headers = route.request().headers();
        console.log(`got headers from listing tracker`);
        route.continue(); // Allow the request to proceed
      } else {
        route.continue(); // Allow the request to proceed
      }
    });
    // go to the main subcategory to get all of them one by one
    let filename;
    try {
      let categorySegment = page.url().split('.com')[1];
      const categoryNameElement = page
        .locator(`div[id*='category'] div[style='color: var(--colors-black-900);']`)
        .first();

      // Ensure the element exists before accessing its text content
      if ((await categoryNameElement.count()) > 0) {
        const categoryName = (await categoryNameElement.textContent())
          .trim() // Trim whitespace
          .replace(/\s+/g, '-') // Replace spaces with hyphens
          .replace(/[&]/g, 'and') // Replace '&' with 'and'
          .replace(/[^a-zA-Z0-9-_]/g, '') // Remove any other special characters
          .toLowerCase(); // Convert to lowercase
        console.log('Category Name:', categoryName);

        // Update the filename with the correct category name
        filename = `Blinkit-${pincode}-${categoryName}-products`;
        console.log('Generated Filename:', filename);
      } else {
        console.error('Category name element not found.');
        throw new Error('Category name element not found.');
      }
    } catch (e) {
      console.error('Error generating filename:', e.message);

      // Extract the default value between /cid/ and /cn/
      const defaultSegment = url.match(/\/cid\/(.*?)\/cn\//);
      if (defaultSegment && defaultSegment[1]) {
        filename = `Blinkit-${pincode}-${defaultSegment[1]}-products`;
        console.log('Using default filename:', filename);
      } else {
        console.error('Unable to extract default segment from URL.');
        filename = `Blinkit-${pincode}-unknown-products`; // Fallback if extraction fails
        console.log('Using fallback filename:', filename);
      }
    }
    console.log('Final Filename:', filename);
    job.attrs.data.progress = 5;
    await job.save();
    const allProducts = [];
    let defaultUrl = 'https://blinkit.com/v1/layout/listing_widgets?l0_cat=16&l1_cat=505'
    const productMap = {};
    let requestUrl = '';
    const [request] = await Promise.all([
      page.waitForRequest(/\/v1\/layout\/listing_widgets\?.*/), // Wait for the request
      pinCode.dispatchEvent('click') // Trigger the request
    ]);
    requestUrl = request.url();
    headers = request.headers();
    // console.log("Request URL:", request.url());
    // console.log("Headers:", request.headers());
    if (!requestUrl){
      const url = page.url();
      const urlParts = url.split('/').filter(Boolean); // Removes empty strings from trailing slashes
      const l0 = urlParts[urlParts.length - 2];
      const l1 = urlParts[urlParts.length - 1];
      requestUrl = defaultUrl.replace('l0_cat=1487', `l0_cat=${l0}`);
      requestUrl = requestUrl.replace('l1_cat=742', `l1_cat=${l1}`);
      console.log(`fallback URL: ${requestUrl}`);
      console.log(`Current page url ${page.url()}`);
    }
    // const totalPages = await findTotalPages(requestUrl);
    const products = [];
    let totalScrapped = 0;
    let postData = {};
    while (true) {
      let res;
      try {
        res = await page.evaluate(
          async (obj) => {
            console.log('inside evaluate');
            const response = await fetch(obj.url, {
              headers: obj.headers,
              body: JSON.stringify(obj.postData),
              method: 'POST',
            });

            const body = await response.json();

            const products = body?.response?.snippets ?? [];
            const nextUrl = body?.response?.pagination?.next_url ?? null;
            const postData = body?.postback_params ?? null;

            return {
              status: response.status,
              products,
              nextUrl,
              postData,
            };
          },
          {
            url: requestUrl,
            headers: headers,
            postData: postData,
          }
        );
      } catch (error) {
        console.error('Error fetching data:', error);
        // await page.waitForTimeout(1000 * 120);
      }

      const status = res.status;
      if (status === 200) {
        console.log(`data fetched with length: ${res.products.length} `)
        products.push(...res.products);
        totalScrapped = products.length;
        // log products length
        console.log(`Products Length: ${totalScrapped}`);
        //
        const nextUrl = res?.nextUrl;
        postData = res.postData;
        job.attrs.data.total_products = products.length;
        await job.save();
        console.log(`Next URL: ${nextUrl}`);
        if (nextUrl) {
          requestUrl = nextUrl;
        } else {
          console.log('no nextUrl')
          break;
        }
        // await page.waitForTimeout(1000 * 120);
        new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    // based on the above json, transform to the descired schema like the one in scrapeBigBasked.js
    //done getting from the api
    console.log(`done from the api part`)

    for (const product of products) {
      try{
        let productName = product?.tracking?.widget_meta?.widget_title || '';
        productName = cleanProductTitle(productName);
        let imageUrl = product?.data?.image?.url;

        const variants = [];
        const objects = product?.data?.variant_list || [];
        for (const variant of objects) {
          variants.push({
            quantity: variant?.data?.variant?.text || '',
            mrp: Number(cleanText(variant?.data?.mrp.text)) || 0,
            price: Number(cleanText(variant?.data?.normal_price?.text)) || 0,
            articleId: variant?.data?.identity?.id || null,
            variantUrl: `https://blinkit.com${getProductLink(variant)}`
          });
        }
        if (variants.length === 0) {

          variants.push({
            quantity: product?.data?.variant?.text || '',
            mrp: Number(cleanText(product?.data?.mrp?.text)) || 0,
            price: Number(cleanText(product?.data?.normal_price?.text)) || 0,
            articleId: product?.data?.identity?.id || null,
            variantUrl: `https://blinkit.com${getProductLink(product)}`
          });
        }
        if (!variants.length) {
          console.log(`No valid variants for ${productName}`);
          continue; // Skip product if no valid variants and main product inventory is 0
        }

        if (!productMap[productName]) {
          productMap[productName] = {
            title: product?.tracking?.widget_meta?.widget_title || '',
            brand: product?.data?.brand_name?.text || '',
            variant: variants.length > 0 ? variants : [],
            imageUrl: imageUrl,
            url: `https://blinkit.com${getProductLink(product)}`,
            pincode: Number(pincode) || null
          };
        } else {
          console.log('Product already exists:', productName);
          variants.forEach((variant) => {
            const existingVariant = productMap[productName].variant.find(
              (v) => v.articleId === variant.articleId
            );
            if (!existingVariant) {
              productMap[productName].variant.push(variant);
            }
          });
        }
      } catch (error) {
        console.error('Error processing product:', product, error.message);
      }
    }
    console.log('after the normalization')
    allProducts.push(...Object.values(productMap));
    job.attrs.data.total_products = allProducts.length;
    job.attrs.data.progress = 100;
    await job.save();
    return [allProducts, filename];
  } catch (error) {
    console.log(`Job ${jobId} failed with error: ${error.message}`);
    await page.screenshot({ path: 'screenshot.png' });
    return [[], null];
  } finally {
    await browser.close();
    const endTime = performance.now();
  }
}

function cleanImageURL(url) {
  // Step 1: Replace escaped slashes
  const cleaned = url.replace(/\\\//g, '/');

  // Step 2: Remove query parameters (everything after "?")
  return cleaned.split('?')[0];
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
export async function main(job, jobId, url, pincode) {
//   await sleep(5000);
//   return [
//     [
//       {
//         title: 'Fortune Premium Kachi Ghani Pure Mustard Oil',
//         brand: 'Fortune',
//         variant: [
//           {
//             quantity: '1 ltr',
//             mrp: 195,
//             price: 159,
//             articleId: 15907,
//             variantUrl:
//               'https://blinkit.com/prn/fortune-premium-kachi-ghani-pure-mustard-oil/prid/15907'
//           },
//           {
//             quantity: '1 ltr',
//             mrp: 190,
//             price: 158,
//             articleId: 50,
//             variantUrl:
//               'https://blinkit.com/prn/fortune-premium-kachi-ghani-pure-mustard-oil/prid/50'
//           },
//           {
//             quantity: '5 ltr',
//             mrp: 1000,
//             price: 827,
//             articleId: 15902,
//             variantUrl:
//               'https://blinkit.com/prn/fortune-premium-kachi-ghani-pure-mustard-oil/prid/15902'
//           }
//         ],
//         imageUrl:
//           'https://cdn.grofers.com/da/cms-assets/cms/product/b6ea131f-4f30-48ff-9b52-dd8488c0980b.jpg',
//         url: 'https://blinkit.com/prn/fortune-premium-kachi-ghani-pure-mustard-oil/prid/15907',
//         pincode: 500074
//       }
//     ],
//     'blinkit'
//   ];
  return await runJob(job, jobId, url, pincode);
}
// await runJob(
//   null,
//   null,
//   'https://blinkit.com/cn/fresh-vegetables/cid/1487/1489',
//   '500085'
// );
function getProductLink(product) {
  if (
    !product ||
    !product.tracking ||
    !product.tracking.widget_meta ||
    !product.tracking.widget_meta.widget_id ||
    !product.tracking.widget_meta.widget_title
  ) {
    throw new Error(
      "Product object must contain 'tracking.widget_meta.id' and 'tracking.widget_meta.title' properties."
    );
  }

  const formatName = (name) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-.]/g, '')
      .replace(/(-|\s)+/g, '-');
  };

  const constructUrl = (parts) => {
    return parts
      .filter((part) => !!part)
      .map((part) => String(part).replace(/\/$/, ''))
      .join('/');
  };

  const formattedName = formatName(product.tracking.widget_meta.widget_title);

  const url = constructUrl([
    '/prn',
    formattedName,
    'prid',
    product.tracking.widget_meta.widget_id,
  ]);

  return url;
}
// remove non digit chars (except , .)
function cleanText(text) {
  if (typeof text !== 'string') {
    return '';
  }
  const cleanedText = text.replace(/[^0-9.,]/g, '');
  return cleanedText;

}
function cleanProductTitle(title) {
  return title
    .replace(/[()]/g, '') // Remove parentheses but keep their content
    .replace(/\d+\.?\d*\s*(kg|g|l|ml)\b/gi, '') // Remove weight/volume measurements (e.g., 10kg, 500g, 1.5l, 250ml)
    .replace(/-/g, ' ') // Replace hyphens with spaces (optional adjustment)
    .replace(/\s{2,}/g, ' ') // Collapse multiple spaces to one
    .trim(); // Remove leading/trailing spaces
}
