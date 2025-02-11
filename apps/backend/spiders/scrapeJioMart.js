import { appendFile } from 'fs/promises';
import playwright from 'playwright';
import { uuid } from 'uuidv4';
// import { scrapeJobs } from '../index.js';
import { appendToJsonFile } from '../utils/save.js';

async function runJob(job, jobId, url, pincode) {
  const browser = await playwright.chromium.launch({
    headless: true // Set to true for headless mode
  });
  const startTime = performance.now(); // Record the start time

  try {
    // Create a new Playwright context
    const context = await browser.newContext();
    const page = await context.newPage();
    // Navigate to the target URL
    console.log("going to url", url);
    await page.goto(url);
    // scrapeJobs[jobId].progress = 5; // Initial progress

    // const categoryName = (
    //   await page.locator('ul.jm-breadcrumbs-list > li:last-child',timeout=60000).textContent()
    // )
    //   .trim()
    //   .replace(/\s+/g, '-') // Replace spaces with hyphens
    //   .replace(/[&]/g, 'and') // Replace '&' with 'and'
    //   .replace(/[^a-zA-Z0-9-_]/g, '') // Remove any other special characters
    //   .toLowerCase();

    await page.route(/(png|jpeg|jpg|svg)$/, (route) => route.abort());

    // Click the button to show the pincode popup
    await page.waitForSelector('#btn_pin_code_delivery', {
      timeout: 3 * 60000
    });
    const pinCodePop = page.locator('#btn_pin_code_delivery');
    await pinCodePop.click();

    // Click the button to enter pincode
    const enterPinCode = page.locator('#btn_enter_pincode');
    await enterPinCode.click();

    // Fill in the pincode
    const pinCodeInput = page.locator('#rel_pincode');
    await pinCodeInput.fill(pincode);

    // Click the submit button
    const submitButton = page.locator('#btn_pincode_submit');
    let foundRequest = false;
    let promiseRes = null;
    const promise = new Promise((resolve, reject) => {
      promiseRes = resolve;
    });

    await page.route('**/*', async (route) => {
      const request = route.request();
      if (
        !request
          .url()
          .includes('https://3yp0hp3wsh-dsn.algolia.net/1/indexes/*/queries')
      ) {
        return route.continue();
      }
      if (!foundRequest) {
        foundRequest = true;
        let postData = route.request().postData();
        const formData = new URLSearchParams(postData);
        const filters = formData.get('filters');
        let res;
        let json;
        try {
          res = await route.fetch();
          json = await res.json();
        } catch (error) {
          console.error('Error fetching data:', error);
        }
        let batch = 0;
        let total = 0;
        while (true) {
          const { arr: transformed, done } = await page.evaluate(
            async ({ filters, json, batch, total }) => {
              const arr = [];
              var url_path = window.location.pathname;
              let seller_id = 0;
              -1 != url_path.indexOf('/s/') && (seller_id = window.plp_cat_id);
              let master_code = window.default_vertical_city_code;
              localStorage.getItem('jio_region_codes') &&
                (master_code = JSON.parse(
                  localStorage.getItem('jio_region_codes')
                ));
              let show_variants = parseInt(window.show_variant);
              function transformItems(items, results) {
                if (results) {
                  let store_code = [];
                  for (let vertical in master_code)
                    if (master_code[vertical])
                      for (let k in master_code[vertical])
                        store_code.push(master_code[vertical][k]);

                  const nowTimestamp = Date.now();
                  for (let i = 0; i < items.length; i++) {
                    if (items[i].jioads_banner) continue;
                    items[i].jioads_banner = !1;
                    var item = items[i];
                    if (
                      (item.selling_price &&
                        item.mrp &&
                        ((items[i].selling_price = parseFloat(
                          item.selling_price
                        ).toFixed(2)),
                        (items[i].mrp = parseFloat(item.mrp).toFixed(2))),
                      (items[i].positions = i + 1),
                      item.seller_names &&
                        item.seller_names[0] &&
                        (items[i].seller_names_3p = item.seller_names[0]),
                      item.brand && (items[i].brand = item.brand.toUpperCase()),
                      (items[i].promo_text = ''),
                      item.tag && '' != item.tag)
                    ) {
                      let show_tag = !1;
                      null == item.tag_todate || '' == item.tag_todate
                        ? (show_tag = !0)
                        : item.tag_todate >= nowTimestamp && (show_tag = !0),
                        (items[i].tag = show_tag ? item.tag : '');
                    }
                    items[i].tag_name && (items[i].tag = items[i].tag_name),
                      item.payment_tag &&
                      '' != item.payment_tag &&
                      item.payment_tag_todate &&
                      '' != item.payment_tag_todate &&
                      item.payment_tag_todate >= nowTimestamp
                        ? (items[i].payment_tag = item.payment_tag)
                        : (items[i].payment_tag = ''),
                      item.mart_availability &&
                      '' != item.mart_availability &&
                      null != item.mart_availability &&
                      null != item.mart_availability
                        ? (items[i].mart_availability = item.mart_availability)
                        : (items[i].mart_availability = ''),
                      (items[i].sell_price_value = 0),
                      delete items[i].category_type,
                      delete items[i].available_stores;
                    let prod_vert = item.vertical_code,
                      size = window.image_core_config.ALL;
                    window.image_core_config[prod_vert] &&
                      (size = window.image_core_config[prod_vert]),
                      (items[i].image_url =
                        image_base +
                        'images/product/original/' +
                        item.image_path +
                        '?im=Resize=(' +
                        size +
                        ')'),
                      (items[i].fashion_image_class = ''),
                      (items[i].show_brand = !1),
                      'FASHION' == prod_vert &&
                        ((items[i].fashion_image_class = 'fashion-variant'),
                        (items[i].show_brand = !0)),
                      (items[i].discount_class =
                        'FASHION' == prod_vert ||
                        'GROCERIES' == prod_vert ||
                        'BEAUTY' == prod_vert
                          ? 'row-discount'
                          : ''),
                      (items[i].mrp_text =
                        'GROCERIES' == prod_vert ||
                        'PREMIUMFRUITS' == prod_vert ||
                        'HOMEANDKITCHEN' == prod_vert
                          ? window.mrp_label
                          : '');
                    let vert_region_codes = master_code[prod_vert]
                        ? master_code[prod_vert]
                        : [],
                      price_obj = {};
                    if (
                      ((items[i].deals_available = !1),
                      items[i].type && 'sponsored' == items[i].type)
                    );
                    else if (0 == seller_id) {
                      delete items[i].seller_wise_mrp;
                      for (let p in vert_region_codes) {
                        let vcode = vert_region_codes[p];
                        if (
                          item.buybox_mrp[vcode] &&
                          item.buybox_mrp[vcode].available
                        ) {
                          (price_obj = item.buybox_mrp[vcode]),
                            Object.keys(items[i].buybox_mrp).forEach(function (
                              code
                            ) {
                              code != vcode && delete items[i].buybox_mrp[code];
                            });
                          break;
                        }
                      }
                    } else {
                      delete items[i].buybox_mrp;
                      for (let p in vert_region_codes) {
                        let vcode = vert_region_codes[p];
                        if (
                          item.seller_wise_mrp[vcode] &&
                          item.seller_wise_mrp[vcode][seller_id] &&
                          item.seller_wise_mrp[vcode][seller_id].available
                        ) {
                          (price_obj = item.seller_wise_mrp[vcode][seller_id]),
                            Object.keys(items[i].seller_wise_mrp).forEach(
                              function (code) {
                                code != vcode &&
                                  delete items[i].seller_wise_mrp[code];
                              }
                            );
                          break;
                        }
                      }
                    }
                    if (
                      (items[i].type && 'sponsored' == items[i].type
                        ? (items[i].is_sponsored = !0)
                        : ((items[i].seller_id = 0),
                          (items[i].is_sponsored = !1)),
                      Object.keys(price_obj).length > 0)
                    ) {
                      let reg_value = price_obj;
                      items[i].seller_id = reg_value.seller_id;
                      let sellprice = reg_value.price,
                        mrp = reg_value.mrp;
                      (items[i].selling_price =
                        parseFloat(sellprice).toFixed(2)),
                        (items[i].mrp = parseFloat(mrp).toFixed(2));
                      let save = mrp - sellprice;
                      if (
                        (null != reg_value.deal_price &&
                          reg_value.deal_price > 0 &&
                          ((items[i].selling_price = parseFloat(
                            reg_value.deal_price
                          ).toFixed(2)),
                          (save = mrp - reg_value.deal_price)),
                        items[i].hasOwnProperty('selling_price') &&
                          items[i].selling_price > 0 &&
                          (items[i].sell_price_value = items[i].selling_price),
                        (items[i].selling_price = items[i].selling_price
                          .toString()
                          .replace(/\B(?=(\d{3})+(?!\d))/g, ',')),
                        (items[i].mrp = items[i].mrp
                          .toString()
                          .replace(/\B(?=(\d{3})+(?!\d))/g, ',')),
                        (items[i].save = save),
                        (items[i].save_foramt = parseFloat(save).toFixed(2)),
                        (items[i].discount_pct = reg_value.discount_pt),
                        (items[i].promo_text = reg_value.promo_description),
                        '0' != window.ds2_lightning_label &&
                          (items[i].deals_available =
                            null != reg_value.deal_price &&
                            reg_value.deal_price > 0),
                        reg_value.weight_range &&
                          '' != reg_value.weight_range &&
                          (items[i].display_name =
                            item.display_name +
                            ' (Approx ' +
                            reg_value.weight_range +
                            ')'),
                        item.uom_for_price_compare_value &&
                          item.uom_for_price_compare_unit &&
                          item.uom_for_price_compare_factor)
                      ) {
                        let uom = (
                          sellprice * item.uom_for_price_compare_factor
                        ).toFixed(2);
                        items[i].unitPrice = uom;
                        items[i].uom =
                          uom +
                          '/' +
                          item.uom_for_price_compare_value +
                          ' ' +
                          item.uom_for_price_compare_unit +
                          ')';
                      }
                    }
                    if (
                      ((items[i].smart_bazaar = !1),
                      'yes' != localStorage.getItem('jio_smart_bazaar') &&
                        'GROCERIES' == prod_vert &&
                        items[i].seller_id == window.smart_seller_id &&
                        (items[i].smart_bazaar = !0),
                      !items[i].mart_availability ||
                        ('JIO' != items[i].mart_availability &&
                          'JIO_INSTA' != items[i].mart_availability) ||
                        (items[i].smart_bazaar = !1),
                      (items[i].show_cart = !0),
                      ('FASHION' != prod_vert &&
                        'WELLNESS' != prod_vert &&
                        'ELECTRONICS' != prod_vert &&
                        'FURNITURE' != prod_vert) ||
                        (items[i].show_cart = !1),
                      1 == $('#ld_landing_page').val() &&
                        (items[i].show_cart = !0),
                      items[i].common_attributes &&
                        items[i].common_attributes.lock_status &&
                        'lockable' == items[i].common_attributes.lock_status &&
                        (items[i].locked_txt = window.locked_phone_html),
                      (items[i].show_variants = show_variants),
                      items[i].variants && show_variants)
                    ) {
                      let is_color_variant = items[i].variants.some(
                        (el) => 'colour' === el.facet_name
                      );
                      if (is_color_variant) {
                        items[i].variants.length > 5 &&
                          ((items[i].variant_remaining =
                            items[i].variants.length - 5),
                          (items[i].variants = items[i].variants.slice(0, 5)));
                        for (let j = 0; j < items[i].variants.length; j++)
                          items[i].variants[j].swatch_image &&
                            -1 ===
                              items[i].variants[j].swatch_image.indexOf(
                                image_base
                              ) &&
                            (items[i].variants[j].swatch_image =
                              image_base +
                              'images/product/original/' +
                              items[i].variants[j].swatch_image);
                      }
                      items[i].is_color_variant = is_color_variant;
                    }
                    if (
                      (items[i].variants || (items[i].show_variants = !1),
                      items[i].variants &&
                        0 == items[i].variants.length &&
                        (items[i].show_variants = !1),
                      (items[i].variant_attribute = ''),
                      items[i].show_variants)
                    ) {
                      let variant_attribute =
                        items[i].variants[0].facet_name.toLowerCase();
                      items[i].variant_value = items[i][variant_attribute];
                      let variants_sku = items[i].variants.map((vari) => ({
                        product_code: vari.product_code,
                        facet_value: vari.facet_value
                      }));
                      variants_sku.unshift({
                        product_code: items[i].product_code,
                        facet_value: items[i].variant_value
                      }),
                        (items[i].variants_sku = JSON.stringify(variants_sku)),
                        (items[i].variant_attribute = variant_attribute);
                    }
                    if (
                      ((items[i].option_code = (
                        items[i].option_code || ''
                      ).replace(/ /g, '_')),
                      'ELECTRONICS' == prod_vert &&
                        '1' == window.preorder_status &&
                        item.pre_order_enabled &&
                        !0 === item.pre_order_enabled &&
                        item.pre_order)
                    ) {
                      items[i].tag = 'Pre Order';
                      let pre_order = item.pre_order;
                      if (
                        pre_order.pre_launch_date &&
                        pre_order.start_date &&
                        pre_order.price_visibility
                      ) {
                        let currentTime = new Date().getTime(),
                          pre_launch_date,
                          pre_launch_time,
                          pre_launch_date_time =
                            pre_order.pre_launch_date.split(' ')[0] +
                            'T' +
                            pre_order.pre_launch_date.split(' ')[1] +
                            '.000+05:30';
                        pre_launch_date_time = new Date(
                          pre_launch_date_time
                        ).getTime();
                        let pre_launch_start_date =
                            pre_order.start_date.split(' ')[0],
                          pre_launch_start_time =
                            pre_order.start_date.split(' ')[1],
                          pre_launch_start_date_time,
                          pre_launch_start_date_time_stamp = new Date(
                            pre_launch_start_date +
                              'T' +
                              pre_launch_start_time +
                              '.000+05:30'
                          ).getTime();
                        pre_launch_date_time <= currentTime &&
                          pre_launch_start_date_time_stamp >= currentTime &&
                          !1 === pre_order.price_visibility &&
                          ((items[i].selling_price = 0),
                          (items[i].sell_price_value = 0));
                      }
                    }
                    if (
                      (item.cellular_type &&
                        '5G' === item.cellular_type &&
                        (items[i].free_sim_txt = window.free_sim_text),
                      (items[i].food_icon = ''),
                      items[i].food_type)
                    ) {
                      let food_type = item.food_type.toLowerCase();
                      'green dot' == food_type
                        ? (items[i].food_icon = 'icon-veg')
                        : 'red dot' == food_type &&
                          (items[i].food_icon = 'icon-non-veg');
                    }
                    items[i].elec_in_stock = 1;
                    let inventory_code,
                      elec_inv = JSON.parse(
                        localStorage.getItem('jio_inventory_store_code')
                      )[prod_vert],
                      prod_inventory,
                      in_out_stock;
                    elec_inv.unshift('ALL'),
                      (elec_inv = elec_inv.map((code) => code.toUpperCase())),
                      0 ==
                        item.inventory_stores
                          .map((code) => code.toUpperCase())
                          .filter((element) => elec_inv.includes(element))
                          .length && (items[i].elec_in_stock = 0),
                      items[i].hasOwnProperty('available_at_3p_seller') &&
                      1 == items[i].available_at_3p_seller
                        ? (items[i].available_at_3p_seller_flag = '3P')
                        : (items[i].available_at_3p_seller_flag = '1P');
                  }
                  return items;
                }
              }
              let index_name = window.algolia_suffix + '_master_vertical';
              const x = algoliasearch(
                window.algolia_app_id,
                window.algolia_api_key,
                {
                  timeouts: {
                    connect: 5,
                    read: 60
                  }
                }
              );
              const index = x.initIndex(index_name);
              async function divide(from, to) {
                const data = await index.search('', {
                  filters: `itemId: ${from} TO ${to} AND ` + filters,
                  hitsPerPage: 1
                  // paginationLimitedTo: 1000000
                });
                console.log('Got data ', data.nbHits);
                if (data.nbHits <= 1000 || to - from <= 1000) {
                  const data = await index.search('', {
                    filters: `itemId: ${from} TO ${to} AND ` + filters,
                    hitsPerPage: 1000
                    // paginationLimitedTo: 1000000
                  });
                  return transformItems(data.hits, json.results[0]).map(
                    (item) => ({
                      name: item.display_name || 'Unknown Product',
                      brand: item.brand || 'Unknown Brand',
                      unitPrice: item.mrp || '0.00',
                      salePrice: item.sell_price_value || '0.00',
                      variant: item.variant_attribute ? item.size : 'N/A',
                      image: item.image_url || 'default-image.jpg',
                      url: item.url_path || '#',
                      uom: item.uom || 'N/A',
                      uom_for_price_compare_factor:
                        item.uom_for_price_compare_factor || 'N/A',
                      uom_for_price_compare_unit:
                        item.uom_for_price_compare_unit || 'N/A',
                      uom_for_price_compare_value:
                        item.uom_for_price_compare_value || 'N/A',
                      discount_pct: item.discount_pct || 0,
                      discount: item.save || '0.00',
                      seller_names: item.seller_names || []
                    })
                  );
                }
                const mid = Math.floor((from + to) / 2);
                const left = await divide(from, mid);
                const right = await divide(mid, to);
                return [...left, ...right];
              }
              let j = 2;
              let i = j * batch;
              let done = false;

              try {
                while (true) {
                  const from = i * 100000;
                  const to = (i + 1) * 100000;
                  const data = await divide(from, to);
                  arr.push(...(data ?? []));
                  console.log('Got data ', data.length, ' Total :', arr.length);
                  i++;
                  await new Promise((resolve) => setTimeout(resolve, 50));
                  try {
                    const obj = await index.findObject(() => true, {
                      filters: `itemId > ${from} AND ` + filters
                    });
                    console.log(obj);
                  } catch (e) {
                    done = true;
                    break;
                  }
                  if (--j === 0) break;
                }
              } catch (e) {
                console.log(e);
              }
              return { arr, done };
            },
            { filters, json, batch, total }
          );
          let prevTotal = total;
          total += transformed.length;
          let progress = (total / json.results[0].nbHits) * 100;
          if (progress > 100) progress = 90;
          if (progress < 5) progress = 5;
          // scrapeJobs[jobId] = {
          // ...scrapeJobs[jobId],
          // progress,
          // total_products: total
          // };
          console.log(
            `${url}:${pincode} Processed ${total} out of ${json.results[0].nbHits}`
          );
          console.log('Last batch size: ', transformed.length);
          // check first if cancelled
          if (transformed.length) {
            try {
              // do not add empty batches
              const filename = `JioMart-${pincode}-${''}-products`;
              await appendToJsonFile(
                `./jobs/${jobId}/${filename}.json`,
                transformed
              );
              await appendFile(
                `./jobs/${jobId}/${prevTotal}_${total}.json`,
                JSON.stringify(transformed, null, 2)
              );
            } catch (e) {
              console.log('Error saving data', e);
            }
          }
          // if (scrapeJobs[jobId].status === 'cancelled') {
          //   return promiseRes();
          // }
          if (done) {
            break;
          }
          batch++;
        }
        console.log('Total products: ', total);
        console.log('done');
        // Finish the promise after processing all pages
        // if (scrapeJobs[jobId].status === 'cancelled') {
        // return promiseRes();
        // }
        const filename = `JioMart-${pincode}-${''}-products`;
        // scrapeJobs[jobId] = {
        //   url,
        //   pincode,
        //   status: 'completed',
        //   progress: 100,
        //   total_products: total,
        //   filename
        // };
        // // write stats to a file
        // await appendFile(
        //   `./jobs/${jobId}/stats.json`,
        //   JSON.stringify(scrapeJobs[jobId], null, 2)
        // );
        promiseRes();
      } else {
        route.continue();
      }
    });

    await submitButton.click();
    await promise; // Wait for all data to be processed
  } catch (error) {
    console.log(`Job ${jobId} failed with error: ${error.message}`);
    return [[], null];
  } finally {
    // await browser.close();
    const endTime = performance.now();
    const duration = endTime - startTime;
    //   console.log(
    //     `Job ${jobId} ${scrapeJobs[jobId].status} in ${duration / 1000} seconds`
    //   );
    //   scrapeJobs[jobId].duration = duration / 1000;
  }
}

export async function main(job, jobId, url, pincode) {
  // scrapeJobs[jobId] = { status: 'running', progress: 0, total_products: 0 };
  // Start the job asynchronously
  return await runJob(job, jobId, url, pincode);
}
