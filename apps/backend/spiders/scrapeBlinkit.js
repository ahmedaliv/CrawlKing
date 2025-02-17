import playwright from 'playwright';
import UserAgent from 'user-agents';
async function runJob(job, jobId, url, pincode) {
  const userAgent = new UserAgent({ deviceCategory: 'desktop' });

  const randomUserAgent = userAgent.toString();
  const browser = await playwright.chromium.launch({
    headless: true,
    // args: [
    //   '--disable-blink-features=AutomationControlled', // Disable automation detection
    //   '--no-sandbox',
    //   '--disable-setuid-sandbox',
    //   '--disable-dev-shm-usage'
    // ]
  });
  try {
    const context = await browser.newContext({
      userAgent: randomUserAgent
    });
    const page = await context.newPage();
    // await page.addInitScript(() => {
    //   Object.defineProperty(navigator, 'webdriver', {
    //     get: () => false
    //   });
    // });
    // page.setDefaultTimeout(60000 * 3);
    // await page.route(/(png|jpeg|jpg|svg)$/, (route) => route.abort());
    await page.goto(url);
    await page.waitForLoadState('domcontentloaded');
    await page.screenshot({ path: 'screenshot.png' }); // Take a screenshot
    await page.waitForSelector("div[class*='ProductsContainer'] a");
    // Handle location input (Pincode)
    await page.waitForSelector("div[class*='LocationBar__SubtitleContainer']", {
      timeout: 3 * 60000
    });
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
    await pinCode.dispatchEvent('click');
    let filename;

    try {
      let categorySegment = url.split('.com')[1];
      const categoryNameElement = page
        .locator(`a[href*="${categorySegment}"]`)
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

    // Use the filename variable outside the try-catch block
    console.log('Final Filename:', filename);
    job.attrs.data.progress = 5;
    await job.save();
    let requestUrl = '';
    let headers = {};
    await page.route(/\/v1\/listing\/widgets\?.*/, (route) => {
      if (requestUrl === '') {
        requestUrl = route.request().url(); // Capture the URL
        console.log(requestUrl); // Log the URL
        headers = route.request().headers(); // Capture the headers
        // log request headers
        route.continue(); // Allow the request to proceed
      } else {
        route.continue(); // Allow the request to proceed
      }
    });

    if (requestUrl === '') {
      console.log('Failed to intercept the request, Scrolling Now');
      await page.evaluate(async () => {
        const selector = "div[class*='ProductsContainer'] a";
        const previousCount = document.querySelectorAll(selector).length;
        const container = document.querySelector(
          "div[class*='ProductsContainer']"
        );
        while (true) {
          // Scroll to the bottom of the page
          window.scrollBy(0, container.scrollHeight / 1.5);

          // Wait for new elements to load (adjust the delay as needed)
          await new Promise((resolve) => setTimeout(resolve, 10000));

          // Get the current count of elements
          const currentCount = document.querySelectorAll(selector).length;

          // If the count increases, update the previous count and continue scrolling
          if (previousCount === 0 || currentCount > previousCount) {
            console.log(
              `Element count increased: ${previousCount} -> ${currentCount}`
            );
            previousCount = currentCount;
          } else {
            // If the count doesn't change, assume no more items to load and break
            console.log('No new elements loaded. Stopping scroll.');
            break;
          }
        }
      });
    }
    async function findTotalPages(url) {
      console.log(`Finding total pages for URL: ${url}`);
      let start = 1; // First page
      let end = 100; // Assume an initial maximum page count
      let totalPages = 0;

      while (start <= end) {
        const mid = Math.floor((start + end) / 2);
        const newUrl = url.replace(/page=\d+/, `page=${mid}`);
        console.log(`Checking page ${mid} - URL: ${newUrl}`);

        try {
          const res = await page.evaluate(
            async (obj) => {
              try {
                const response = await fetch(obj.url, {
                  headers: obj.headers
                });
                const body = await response.json();
                return {
                  status: response.status,
                  nextUrl: body.pagination.next_url || ''
                };
              } catch (error) {
                console.error('Error during fetch in evaluate:', error);
                return { status: 500, nextUrl: null };
              }
            },
            { url: newUrl, headers }
          );

          if (res.status === 200) {
            const nextPageMatch = res.nextUrl.match(/page=(\d+)/);
            const nextPage = nextPageMatch ? parseInt(nextPageMatch[1], 10) : 0;
            console.log(`Next page number: ${nextPage}`);
            if (nextPage && nextPage < mid) {
              // If next page number is lower than mid, we've found the last page
              console.log(`Found the last page: ${nextPage}`);
              totalPages = nextPage;
              break;
            } else if (nextPage && nextPage >= mid) {
              // If next page number is higher or equal, search the upper half
              start = mid + 1;
            } else {
              // If no next URL is present, this could be the last page
              totalPages = mid;
              break;
            }
          } else {
            throw new Error(
              `Failed to fetch page ${mid}, status: ${res.status}`
            );
          }
        } catch (error) {
          console.error(`Error fetching page ${mid}:`, error.message);
          break; // Exit the loop on error
        }
      }

      return totalPages;
    }

    const totalPages = await findTotalPages(requestUrl);
    const products = [];
    if (requestUrl) {
      // change page to be 0
      requestUrl = requestUrl.replace(/page=\d+/, 'page=0');
    }
    let totalScrapped = 0;
    for (let i = 1; i <= totalPages; i++) {
      let res = await page.evaluate(
        async (obj) => {
          console.log('inside evaluate');
          const response = await fetch(obj.url, {
            headers: obj.headers
          });
          body = await response.json();
          products = body['objects'];
          nextUrl = body['pagination']['next_url'];
          return {
            status: response.status,
            products: products,
            nextUrl: nextUrl
          };
        },
        {
          url: requestUrl,
          headers: headers
        }
      );
      const status = res.status;
      if (status === 200) {
        products.push(...res.products);
        totalScrapped = products.length;
        // log products length
        console.log(`Products Length: ${totalScrapped}`);
        //
        const nextUrl = res.nextUrl;
        job.attrs.data.progress = 15 + Math.ceil(((i + 1) * 85) / totalPages);
        job.attrs.data.total_products = totalScrapped;
        await job.save();
        console.log(`Next URL: ${nextUrl}`);
        if (nextUrl) {
          requestUrl = nextUrl;
        } else {
          break;
        }
      }
    }
    // based on the above json, transform to the descired schema like the one in scrapeBigBasked.js
    function getProductLink(product) {
      if (
        !product ||
        !product.tracking ||
        !product.tracking.widget_meta ||
        !product.tracking.widget_meta.id ||
        !product.tracking.widget_meta.title
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

      const formattedName = formatName(product.tracking.widget_meta.title);

      const url = constructUrl([
        '/prn',
        formattedName,
        'prid',
        product.tracking.widget_meta.id
      ]);

      return url;
    }

    const allProducts = products
      .map((product) => {
        try {
          const mainInventory =
            product?.tracking?.widget_meta?.custom_data?.inventory ??
            product?.data?.product?.inventory;

          console.log('Processing product:', mainInventory);

          if (mainInventory === 0) {
            console.log('Skipping product with inventory 0');
            throw Error('empty'); // Skip product if inventory is 0
          }

          const variants = (product?.objects || [])
            .filter((variant) => {
              const variantInventory =
                variant?.tracking?.widget_meta?.custom_data?.inventory ??
                variant?.data?.product?.inventory;

              return variantInventory !== 0; // Skip variants with inventory 0
            })
            .map((variant) => ({
              quantity: variant?.data?.product?.unit || '',
              mrp: variant?.data?.product?.mrp || 0,
              price: variant?.data?.product?.price || 0,
              articleId: variant?.data?.product?.product_id || null
            }));

          if (!variants.length && mainInventory === 0) {
            return null; // Skip product if no valid variants and main product inventory is 0
          }

          return {
            title: product?.tracking?.widget_meta?.title || '',
            brand: product?.data?.product?.brand || '',
            variant: variants.length
              ? variants
              : [
                  {
                    quantity: product?.data?.product?.unit || '',
                    mrp: product?.data?.product?.mrp || 0,
                    price: product?.data?.product?.price || 0,
                    articleId: product?.data?.product?.product_id || null
                  }
                ],
            url: getProductLink(product),
            pincode: Number(pincode) || null
          };
        } catch (error) {
          console.error('Error processing product:', product, error.message);
          return null; // Skip this product if an error occurs
        }
      })
      .filter((product) => !!product);
    job.attrs.data.total_products = allProducts.length;
    job.attrs.data.progress = 100;
    await job.save();
    return [allProducts, filename];
  } catch (error) {
    console.log(`Job ${jobId} failed with error: ${error.message}`);
    return [[], null];
  } finally {
    await browser.close();
    const endTime = performance.now();
  }
}

export async function main(job, jobId, url, pincode) {
  return await runJob(job, jobId, url, pincode);
}
// await runJob(
//   null,
//   null,
//   'https://blinkit.com/cn/fresh-vegetables/cid/1487/1489',
//   '500085'
// );
