
import { chromium } from 'playwright';
import UserAgent from 'user-agents';

// Configuration constants
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const SCROLL_TIMEOUT = 1000; // 1 second
const MAX_RETRIES = 3;
const CONCURRENT_PRODUCT_LIMIT = 20; // Number of products to process concurrently

async function runJob(job, jobId, url, pincode) {
    console.log(`Starting scrape job for ${url} with pincode ${pincode}`);
    const browser = await chromium.launch({
        headless: process.env.SPIDERS_HEADLESS_MODE === 'true' // Run headless for better performance
    });
    const userAgent = new UserAgent({ deviceCategory: 'desktop' });
    const randomUserAgent = userAgent.toString();
    const context = await browser.newContext({
        userAgent: randomUserAgent,
        viewport: { width: 1280, height: 720 },
        bypassCSP: true
    });
    const page = await context.newPage();

    const startTime = performance.now();
    let products = [];
    let fileName = '';
    try {
        // Create browser context with optimized settings

        // Block unnecessary resources to improve performance
        await context.route(
            /\.(png|jpg|jpeg|gif|svg|woff|woff2|ttf|otf|css)$/i,
            (route) => route.abort()
        );
        await context.route(/\/(analytics|tracking|advertisement|ad)\//i, (route) =>
            route.abort()
        );

        page.setDefaultTimeout(DEFAULT_TIMEOUT);

        // Navigate to the target URL with retry logic
        let navigationSuccess = false;
        for (
            let attempt = 0;
            attempt < MAX_RETRIES && !navigationSuccess;
            attempt++
        ) {
            try {
                await page.goto(url, {
                    waitUntil: 'domcontentloaded',
                    timeout: DEFAULT_TIMEOUT
                });
                navigationSuccess = true;
            } catch (error) {
                console.log(
                    `Navigation attempt ${attempt + 1} failed: ${error.message}`
                );
                if (attempt === MAX_RETRIES - 1) throw error;
                await page.waitForTimeout(2000); // Wait before retry
            }
        }

        // Extract category name for filename
        const categoryElement = await page
            .waitForSelector('ul.jm-breadcrumbs-list > li:last-child', {
                timeout: DEFAULT_TIMEOUT
            })
            .catch(() => null);

        let categoryName = 'grocery-category';
        if (categoryElement) {
            categoryName = (await categoryElement.innerText())
                .trim()
                .replace(/\s+/g, '-')
                .replace(/[&]/g, 'and')
                .replace(/[^a-zA-Z0-9-_]/g, '')
                .toLowerCase();
        }

        fileName = `JioMart-${pincode}-${categoryName}-products`;
        job.attrs.data.progress = 5;
        await job.save();
        const [request] = await Promise.all([
            page.waitForRequest(request =>
                request.url().includes('/1/indexes/') && request.method() === 'POST'
            ),
            handlePincodeEntry(page, pincode) // This triggers the request
        ]);

        const requestUrl = request.url();
        const requestHeaders = request.headers();
        const requestPostData = request.postData();           // <-- JSON string

        // parse it into the object shape your helper needs:
        const originalPostData = JSON.parse(requestPostData);  // <-- now an object

        console.log('Request URL:', requestUrl);
        console.log('Request Headers:', requestHeaders);
        console.log('Request Post Data (parsed):', originalPostData);

        await page.waitForSelector('.ais-InfiniteHits-list', { timeout: 30_000 });
        let variantLink = "https://3yp0hp3wsh-dsn.algolia.net/1/indexes/*/objects?x-algolia-agent=Algolia%20for%20JavaScript%20(4.5.1)%3B%20Browser";

        try {
            const [request] = await Promise.all([
                page.waitForRequest(request =>
                    request.url().includes('/objects?') && request.method() === 'POST'
                ),
                page.click('.variant_dropdown')
            ]);
            variantLink = request.url();
        } catch (error) {
            console.error('Error getting variant POST link, using the default...');
        }
        const allProducts = (await scrapeAllPages({
            page,
            baseUrl: requestUrl,
            variantLink,
            headers: requestHeaders,
            originalPostData,
            job
        })).map(p => {
            p['pincode'] = Number(pincode);
            return p;
        });

        return [allProducts, fileName]

    } catch (error) {
        console.error(`Error during initial setup: ${error.message}`);
        throw error;
    } finally {
        await page.close();
        await context.close();
        await browser.close();
    }

}

export async function main(job, jobId, url, pincode) {
    return await runJob(job, jobId, url, pincode);
}
function extractQuantity(title) {
    const quantityPattern =
        /\b(\d*\.?\d*\s?(?:g|kg|ml|l|pcs|pack|dozen|count|bags|bottle|tin|cans|sachet|strip|tablet|capsule|bar|bundle|roll|pair|set|box|carton|tray|cup|stick|piece|pouch))\b/i;
    const match = title.match(quantityPattern);
    return match ? match[0] : '';
}

async function handlePincodeEntry(page, pincode) {
    try {
        await page.waitForSelector('#btn_pin_code_delivery');
        await page.click('#btn_pin_code_delivery');

        await page.waitForSelector('#btn_enter_pincode');
        await page.click('#btn_enter_pincode');

        await page.waitForSelector('#rel_pincode');
        await page.fill('#rel_pincode', pincode);

        await page.click('#btn_pincode_submit');

        await page.waitForSelector('.ais-InfiniteHits-list');
    } catch (error) {
        throw new Error(`Pincode error: ${error.message}`);
    }
}

async function scrapeAllPages({ page, baseUrl, variantLink, headers, originalPostData, job }) {
    const allHits = [];
    let pageNum = 0;
    const hitsPerPage = 50;

    console.log(`⏳ Starting pagination scrape: baseUrl=${baseUrl}`);
    console.log(`🔑 Using headers:`, headers);

    while (true) {
        // deep-clone the original payload
        const modifiedPostData = JSON.parse(JSON.stringify(originalPostData));

        // adjust pagination params
        modifiedPostData.requests[0].params = modifiedPostData.requests[0].params
            .replace(/hitsPerPage=\d+/, `hitsPerPage=${hitsPerPage}`)
            .replace(/page=\d+/, `page=${pageNum}`);

        console.log(`\n➡️  Fetching page ${pageNum} with hitsPerPage=${hitsPerPage}`);
        // (optionally log the full params string)
        console.log(`params: ${modifiedPostData.requests[0].params}`);

        let response;
        try {
            response = await page.request.post(baseUrl, {
                headers,
                data: modifiedPostData,
            });
        } catch (err) {
            console.error(`❌ Request failed on page ${pageNum}:`, err);
            throw err;
        }

        let body;
        let transformed = []
        let firstResult = {}
        try {
            body = await response.json();
            const hits = body.results?.[0]?.hits || [];
            firstResult = body.results?.[0] || {};
            transformed = await page.evaluate(async ({ hits, firstResult }) => {
                const arr = [];

                var url_path = window.location.pathname;
                let seller_id = 0;
                -1 != url_path.indexOf('/s/') && (seller_id = window.plp_cat_id);

                let master_code = window.default_vertical_city_code;
                if (localStorage.getItem('jio_region_codes')) {
                    master_code = JSON.parse(localStorage.getItem('jio_region_codes'));
                }

                let show_variants = parseInt(window.show_variant);

                var promo_url = "/collection/mcat_promo/get_products";
                let index_name = window.algolia_suffix + "_master_vertical";

                let sponsored_map = {};
                let banner_map = {};
                let promo_map = {};

                let plp_vertical = window.plp_vertical;
                var image_base = window.product_image_path;
                function extractQuantity(title) {
                    const quantityPattern =
                        /\b(\d*\.?\d*\s?(?:g|kg|ml|l|pcs|pack|dozen|count|bags|bottle|tin|cans|sachet|strip|tablet|capsule|bar|bundle|roll|pair|set|box|carton|tray|cup|stick|piece|pouch))\b/i;
                    const match = title.match(quantityPattern);
                    return match ? match[0] : '';
                }

                function transformItems(items, results) {
                    if (results && 0 == results.page && results.userData) {
                        let promo_prod = results.userData;
                        results.userData[0] && results.userData[0].OptionFilters && (promo_prod = results.userData[0].OptionFilters),
                            promo_prod.sort((function (a, b) {
                                return a.position < b.position ? -1 : a.position > b.position ? 1 : 0
                            }
                            ));
                        let pin = localStorage.getItem("nms_mgo_pincode")
                            , state_code = localStorage.getItem("nms_mgo_state_code")
                            , city = localStorage.getItem("nms_mgo_city")
                            , store_code = [];
                        for (let vertical in master_code)
                            if (master_code[vertical])
                                for (let k in master_code[vertical])
                                    store_code.push(master_code[vertical][k]);
                        if (0 == window.promo_loaded) {
                            window.promo_loaded = !0;
                            let promo_prod_arr = [];
                            if (promo_prod.length > 0) {
                                for (let i = 0; i < promo_prod.length; i++) {
                                    let promo_product = promo_prod[i]
                                        , target_match = !0;
                                    if (promo_product.target) {
                                        let target = promo_product.target;
                                        "yes" == localStorage.getItem("jio_smart_bazaar") ? -1 == target.indexOf("SMART") && (target_match = !1) : -1 == target.indexOf("JIO") && (target_match = !1)
                                    } else
                                        "yes" == localStorage.getItem("jio_smart_bazaar") && (target_match = !1);
                                    if (target_match && promo_product.pin && promo_product.state_code && promo_product.city && promo_product.store_code && promo_product.product_code && promo_product.tag_name) {
                                        let store_check = !1;
                                        promo_product.store_code.length > 0 && (store_check = promo_product.store_code.some(r => store_code.indexOf(r) >= 0)),
                                            0 == promo_product.pin.length && 0 == promo_product.state_code.length && 0 == promo_product.city.length && 0 == promo_product.store_code.length ? promo_prod_arr.push(promo_product.product_code) : (-1 != promo_product.pin.indexOf(pin) || -1 != promo_product.state_code.indexOf(state_code) || -1 != promo_product.city.indexOf(city) || store_check) && promo_prod_arr.push(promo_product.product_code)
                                    }
                                }
                                promo_prod_arr.length > 0 && ("yes" == localStorage.getItem("jio_smart_bazaar") && (promo_url += "?smart_bazaar=1"),
                                    $.ajax({
                                        url: promo_url,
                                        method: "GET",
                                        data: {
                                            sku: promo_prod_arr.join(),
                                            index: index_name
                                        },
                                        dataType: "JSON",
                                        async: !1,
                                        success: function (resp) {
                                            if (resp && resp.nbHits > 0) {
                                                window.promo_json = resp.hits;
                                                for (let i = 0; i < promo_prod.length; i++) {
                                                    let promo_product = promo_prod[i]
                                                        , target_match = !0;
                                                    if (promo_product.target) {
                                                        let target = promo_product.target;
                                                        "yes" == localStorage.getItem("jio_smart_bazaar") ? -1 == target.indexOf("SMART") && (target_match = !1) : -1 == target.indexOf("JIO") && (target_match = !1)
                                                    } else
                                                        "yes" == localStorage.getItem("jio_smart_bazaar") && (target_match = !1);
                                                    let can_insert = !1;
                                                    if (target_match && promo_product.pin && promo_product.state_code && promo_product.city && promo_product.store_code && promo_product.product_code && promo_product.tag_name) {
                                                        let store_check = !1;
                                                        promo_product.store_code.length > 0 && (store_check = promo_product.store_code.some(r => store_code.indexOf(r) >= 0)),
                                                            0 == promo_product.pin.length && 0 == promo_product.state_code.length && 0 == promo_product.city.length && 0 == promo_product.store_code.length ? can_insert = !0 : (-1 != promo_product.pin.indexOf(pin) || -1 != promo_product.state_code.indexOf(state_code) || -1 != promo_product.city.indexOf(city) || store_check) && (can_insert = !0)
                                                    }
                                                    let pos = promo_prod[i].position;
                                                    pos < 0 && (pos = 0);
                                                    let sku = promo_prod[i].product_code
                                                        , tag = promo_prod[i].tag_name
                                                        , index = window.promo_json.findIndex(obj => obj.product_code == sku);
                                                    -1 != index && can_insert && (window.promo_json[index].tag_name = tag,
                                                        window.promo_json[index].type = "promo",
                                                        promo_map[pos] = window.promo_json[index])
                                                }
                                            }
                                        },
                                        error: function () { }
                                    }))
                            }
                        } else if (1 == window.promo_loaded && 0 == window.sort_applied && window.promo_json.length > 0)
                            for (let i = 0; i < promo_prod.length; i++) {
                                let promo_product = promo_prod[i]
                                    , target_match = !0;
                                if (promo_product.target) {
                                    let target = promo_product.target;
                                    "yes" == localStorage.getItem("jio_smart_bazaar") ? -1 == target.indexOf("SMART") && (target_match = !1) : -1 == target.indexOf("JIO") && (target_match = !1)
                                } else
                                    "yes" == localStorage.getItem("jio_smart_bazaar") && (target_match = !1);
                                let can_insert = !1;
                                if (target_match && promo_product.pin && promo_product.state_code && promo_product.city && promo_product.store_code && promo_product.product_code && promo_product.tag_name) {
                                    let store_check = !1;
                                    promo_product.store_code.length > 0 && (store_check = promo_product.store_code.some(r => store_code.indexOf(r) >= 0)),
                                        0 == promo_product.pin.length && 0 == promo_product.state_code.length && 0 == promo_product.city.length && 0 == promo_product.store_code.length ? can_insert = !0 : (-1 != promo_product.pin.indexOf(pin) || -1 != promo_product.state_code.indexOf(state_code) || -1 != promo_product.city.indexOf(city) || store_check) && (can_insert = !0)
                                }
                                let pos = promo_prod[i].position;
                                pos < 0 && (pos = 0);
                                let sku = promo_prod[i].product_code
                                    , index = window.promo_json.findIndex(obj => obj.product_code == sku);
                                -1 != index && can_insert && (promo_map[pos] = window.promo_json[index])
                            }
                    }
                    if ("ALCOHOL" == plp_vertical || "LOCALSHOPS" == plp_vertical) {
                        let selected_store = JSON.parse(localStorage.getItem("jio_hyperlocal_store"));
                        selected_store && selected_store.seller_id && (seller_id = selected_store.seller_id)
                    }
                    console.log("seller id", seller_id);
                    let limit = results.hitsPerPage
                        , page = results.page;
                    const final_items = []
                        , final_position_map = {}
                        , occupiedSlots = new Set;
                    Object.entries(sponsored_map).forEach(([posStr, item]) => {
                        const pos = parseInt(posStr, 10);
                        final_position_map[pos] = item,
                            occupiedSlots.add(pos)
                    }
                    ),
                        Object.entries(promo_map).forEach(([posStr, item]) => {
                            let pos = parseInt(posStr, 10);
                            for (; occupiedSlots.has(pos);)
                                pos++;
                            final_position_map[pos] = item,
                                occupiedSlots.add(pos)
                        }
                        );
                    let organicCursor = 0
                        , totalVisible = page * limit + limit;
                    for (let i = page * limit + 1; i <= totalVisible; i++)
                        !final_position_map[i] && organicCursor < items.length && (final_position_map[i] = items[organicCursor],
                            organicCursor++);
                    for (let i = page * limit + 1; i <= totalVisible; i++)
                        banner_map[i] && final_items.push(banner_map[i]),
                            final_position_map[i] && final_items.push(final_position_map[i]);
                    console.log("final items", final_items),
                        items = final_items;
                    const nowTimestamp = Date.now();
                    for (let i = 0; i < items.length; i++) {
                        if (items[i].jioads_banner)
                            continue;
                        items[i].jioads_banner = !1;
                        var item = items[i];
                        if (item.selling_price && item.mrp && (items[i].selling_price = parseFloat(item.selling_price).toFixed(2),
                            items[i].mrp = parseFloat(item.mrp).toFixed(2)),
                            items[i].positions = i + 1,
                            item.brand && (items[i].brand = item.brand.toUpperCase()),
                            items[i].promo_text = "",
                            item.tag && "" != item.tag) {
                            let show_tag = !1;
                            null == item.tag_todate || "" == item.tag_todate ? show_tag = !0 : item.tag_todate >= nowTimestamp && (show_tag = !0),
                                items[i].tag = show_tag ? item.tag : ""
                        }
                        items[i].tag_name && (items[i].tag = items[i].tag_name),
                            item.payment_tag && "" != item.payment_tag && item.payment_tag_todate && "" != item.payment_tag_todate && item.payment_tag_todate >= nowTimestamp ? items[i].payment_tag = item.payment_tag : items[i].payment_tag = "",
                            item.mart_availability && "" != item.mart_availability && null != item.mart_availability && null != item.mart_availability ? items[i].mart_availability = item.mart_availability : items[i].mart_availability = "",
                            items[i].sell_price_value = 0,
                            delete items[i].category_type,
                            delete items[i].available_stores;
                        let prod_vert = item.vertical_code
                            , size = window.image_core_config.ALL;
                        if (window.image_core_config[prod_vert] && (size = window.image_core_config[prod_vert]),
                            items[i].image_url = image_base + "images/product/original/" + item.image_path + "?im=Resize=(" + size + ")",
                            items[i].fashion_image_class = "",
                            items[i].show_brand = !1,
                            "FASHION" == prod_vert && (items[i].fashion_image_class = "fashion-variant",
                                items[i].show_brand = !0),
                            items[i].show_wishlist = !0,
                            "ALCOHOL" != prod_vert && "LOCALSHOPS" != prod_vert || (items[i].show_wishlist = !1),
                            "ALCOHOL" == prod_vert && items[i].addition_info) {
                            let addition_info = items[i].addition_info;
                            addition_info.product_volume && (items[i].product_volume = addition_info.product_volume),
                                addition_info.alcohol_by_volume && (items[i].alcohol_by_volume = addition_info.alcohol_by_volume)
                        }
                        items[i].discount_class = "FASHION" == prod_vert || "GROCERIES" == prod_vert || "BEAUTY" == prod_vert ? "row-discount" : "",
                            items[i].mrp_text = "GROCERIES" == prod_vert || "PREMIUMFRUITS" == prod_vert || "HOMEANDKITCHEN" == prod_vert ? mrp_label : "";
                        let vert_region_codes = master_code[prod_vert] ? master_code[prod_vert] : []
                            , price_obj = {};
                        if (items[i].deals_available = !1,
                            items[i].type && "sponsored" == items[i].type)
                            ;
                        else if (0 == seller_id) {
                            delete items[i].seller_wise_mrp;
                            for (let p in vert_region_codes) {
                                let vcode = vert_region_codes[p];
                                if (item.buybox_mrp[vcode] && item.buybox_mrp[vcode].available) {
                                    price_obj = item.buybox_mrp[vcode],
                                        Object.keys(items[i].buybox_mrp).forEach((function (code) {
                                            code != vcode && delete items[i].buybox_mrp[code]
                                        }
                                        ));
                                    break
                                }
                            }
                        } else {
                            delete items[i].buybox_mrp;
                            for (let p in vert_region_codes) {
                                let vcode = vert_region_codes[p];
                                if (item.seller_wise_mrp[vcode] && item.seller_wise_mrp[vcode][seller_id] && item.seller_wise_mrp[vcode][seller_id].available) {
                                    price_obj = item.seller_wise_mrp[vcode][seller_id],
                                        Object.keys(items[i].seller_wise_mrp).forEach((function (code) {
                                            code != vcode && delete items[i].seller_wise_mrp[code]
                                        }
                                        ));
                                    break
                                }
                            }
                        }
                        if (items[i].type && "sponsored" == items[i].type ? items[i].is_sponsored = !0 : (items[i].seller_id = 0,
                            items[i].is_sponsored = !1),
                            Object.keys(price_obj).length > 0) {
                            let reg_value = price_obj;
                            items[i].seller_id = reg_value.seller_id,
                                items[i].seller_names && reg_value.seller_name && (item.seller_names[0] = reg_value.seller_name);
                            let sellprice = reg_value.price;
                            if (sellprice > 0) {
                                let mrp = reg_value.mrp;
                                items[i].selling_price = parseFloat(sellprice).toFixed(2),
                                    items[i].mrp = parseFloat(mrp).toFixed(2);
                                let save = mrp - sellprice;
                                if (null != reg_value.deal_price && reg_value.deal_price > 0 && (items[i].selling_price = parseFloat(reg_value.deal_price).toFixed(2),
                                    save = mrp - reg_value.deal_price),
                                    items[i].hasOwnProperty("selling_price") && items[i].selling_price > 0 && (items[i].sell_price_value = items[i].selling_price),
                                    items[i].selling_price = items[i].selling_price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","),
                                    items[i].mrp = items[i].mrp.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","),
                                    items[i].save = save,
                                    items[i].save_foramt = parseFloat(save).toFixed(2),
                                    items[i].discount_pct = reg_value.discount_pt,
                                    items[i].promo_text = reg_value.promo_description,
                                    "0" != ds2_lightning_label && (items[i].deals_available = null != reg_value.deal_price && reg_value.deal_price > 0),
                                    reg_value.weight_range && "" != reg_value.weight_range && (items[i].display_name = item.display_name + " (Approx " + reg_value.weight_range + ")"),
                                    item.uom_for_price_compare_value && item.uom_for_price_compare_unit && item.uom_for_price_compare_factor) {
                                    let uom = (sellprice * item.uom_for_price_compare_factor).toFixed(2);
                                    items[i].uom = "(&#8377; " + uom + "/" + item.uom_for_price_compare_value + " " + item.uom_for_price_compare_unit + ")"
                                }
                            }
                        }
                        if (item.seller_names && item.seller_names[0] && (items[i].seller_names_3p = item.seller_names[0]),
                            items[i].smart_bazaar = !1,
                            "yes" != localStorage.getItem("jio_smart_bazaar") && "GROCERIES" == prod_vert && items[i].seller_id == window.smart_seller_id && (items[i].smart_bazaar = !0),
                            !items[i].mart_availability || "JIO" != items[i].mart_availability && "JIO_INSTA" != items[i].mart_availability || (items[i].smart_bazaar = !1),
                            items[i].show_cart = !0,
                            "FASHION" != prod_vert && "WELLNESS" != prod_vert && "ELECTRONICS" != prod_vert && "FURNITURE" != prod_vert || (items[i].show_cart = !1),
                            1 == $("#ld_landing_page").val() && (items[i].show_cart = !0),
                            items[i].common_attributes && items[i].common_attributes.lock_status && "lockable" == items[i].common_attributes.lock_status && (items[i].locked_txt = window.locked_phone_html),
                            items[i].show_variants = show_variants,
                            items[i].variants && show_variants) {
                            let is_color_variant = items[i].variants.some(el => "colour" === el.facet_name);
                            if (is_color_variant) {
                                items[i].variants.length > 5 && (items[i].variant_remaining = items[i].variants.length - 5,
                                    items[i].variants = items[i].variants.slice(0, 5));
                                for (let j = 0; j < items[i].variants.length; j++)
                                    items[i].variants[j].swatch_image && -1 === items[i].variants[j].swatch_image.indexOf(image_base) && (items[i].variants[j].swatch_image = image_base + "images/product/original/" + items[i].variants[j].swatch_image)
                            }
                            items[i].is_color_variant = is_color_variant
                        }
                        if (items[i].variants || (items[i].show_variants = !1),
                            items[i].variants && 0 == items[i].variants.length && (items[i].show_variants = !1),
                            items[i].variant_attribute = "",
                            items[i].show_variants) {
                            let variant_attribute = items[i].variants[0].facet_name.toLowerCase();
                            items[i].variant_value = items[i][variant_attribute];
                            let variants_sku = items[i].variants.map(vari => ({
                                product_code: vari.product_code,
                                facet_value: vari.facet_value
                            }));
                            variants_sku.unshift({
                                product_code: items[i].product_code,
                                facet_value: items[i].variant_value
                            }),
                                items[i].variants_sku = JSON.stringify(variants_sku),
                                items[i].variant_attribute = variant_attribute
                        }
                        if (items[i].option_code = (items[i].option_code || "").replace(/ /g, "_"),
                            "ELECTRONICS" == prod_vert && "1" == window.preorder_status && item.pre_order_enabled && !0 === item.pre_order_enabled && item.pre_order) {
                            items[i].tag = "Pre Order";
                            let pre_order = item.pre_order;
                            if (pre_order.pre_launch_date && pre_order.start_date && pre_order.price_visibility) {
                                let currentTime = (new Date).getTime(), pre_launch_date, pre_launch_time, pre_launch_date_time = pre_order.pre_launch_date.split(" ")[0] + "T" + pre_order.pre_launch_date.split(" ")[1] + ".000+05:30";
                                pre_launch_date_time = new Date(pre_launch_date_time).getTime();
                                let pre_launch_start_date = pre_order.start_date.split(" ")[0], pre_launch_start_time = pre_order.start_date.split(" ")[1], pre_launch_start_date_time, pre_launch_start_date_time_stamp = new Date(pre_launch_start_date + "T" + pre_launch_start_time + ".000+05:30").getTime();
                                pre_launch_date_time <= currentTime && pre_launch_start_date_time_stamp >= currentTime && !1 === pre_order.price_visibility && (items[i].selling_price = 0,
                                    items[i].sell_price_value = 0)
                            }
                        }
                        if (item.cellular_type && "5G" === item.cellular_type && (items[i].free_sim_txt = window.free_sim_text),
                            items[i].food_icon = "",
                            items[i].food_type) {
                            let food_type = item.food_type.toLowerCase();
                            "green dot" == food_type ? items[i].food_icon = "icon-veg" : "red dot" == food_type && (items[i].food_icon = "icon-non-veg")
                        }
                        items[i].elec_in_stock = 1;
                        let elec_inv = [], inventory_code = JSON.parse(localStorage.getItem("jio_store_codes_classified")), prod_inv = inventory_code[prod_vert], item_inv, prod_inventory, in_out_stock;
                        if (prod_inv["1P"] && prod_inv["1P"].map(code => {
                            let inv = code.toUpperCase();
                            elec_inv.push(inv)
                        }
                        ),
                            prod_inv["3P"] && prod_inv["3P"].map(code => {
                                let inv = code.toUpperCase();
                                elec_inv.push(inv)
                            }
                            ),
                            elec_inv.unshift("ALL"),
                            "ALCOHOL" == prod_vert || "LOCALSHOPS" == prod_vert) {
                            let selected_store = JSON.parse(localStorage.getItem("jio_hyperlocal_store"));
                            selected_store.vertical == prod_vert && (elec_inv = [selected_store.code])
                        }
                        item.inventory_stores_3p || (item.inventory_stores_3p = []),
                            0 == [...item.inventory_stores, ...item.inventory_stores_3p].map(code => code.toUpperCase()).filter(element => elec_inv.includes(element)).length && (items[i].elec_in_stock = 0),
                            items[i].hasOwnProperty("seller_id") && items[i].seller_id == window.smart_seller_id ? (items[i].available_at_3p_seller_flag = "1P",
                                items[i].available_at_3p_seller = !1) : (items[i].available_at_3p_seller_flag = "3P",
                                    items[i].available_at_3p_seller = !0),
                            items[i].hasOwnProperty("available_at_3p_seller") && 1 == items[i].available_at_3p_seller ? items[i].available_at_3p_seller_flag = "3P" : items[i].available_at_3p_seller_flag = "1P";
                        let matching_store = "";
                        if ("LOCALSHOPS" == prod_vert) {
                            let prod_invent = item.inventory_stores_3p
                                , local_stores = [];
                            inventory_code.LOCALSHOPS["1P"] && (local_stores = [...local_stores, ...inventory_code.LOCALSHOPS["1P"]]),
                                inventory_code.LOCALSHOPS["3P"] && (local_stores = [...local_stores, ...inventory_code.LOCALSHOPS["3P"]]),
                                matching_store = local_stores.find(value => prod_invent.includes(value))
                        }
                        items[i].matching_store = matching_store
                        items[i].finalMRP = price_obj?.mrp;
                        items[i].finalSalePrice = price_obj?.price;
                    }
                    return items
                }
                return transformItems(hits, firstResult)
                    .map((item) => {
                        const quantity = item.size || extractQuantity(item.display_name) || null;
                        const mrp = Number(item.finalMRP) || 0
                        const price = Number(item.finalSalePrice) || 0
                        // Skip items where mrp or price is 0
                        if (mrp === 0 || price === 0) return null;

                        return {
                            name: item.display_name || 'unknown product',
                            brand: item.brand || 'unknown brand',
                            variant: [{
                                quantity,
                                mrp,
                                price,
                                articleId: Number(item.objectID),
                                variantUrl: `https://www.jiomart.com${item.url_path}`
                            }],
                            imageUrl: item.image_url || 'default-image.jpg',
                            url:`https://www.jiomart.com${item.url_path}`, 
                            variantCodes: item?.variants?.map(v => v.product_code)
                        };
                    })
                    .filter(Boolean); // Remove the nulls
                // return transformItems(hits, firstResult).map(
                // (item) => ({
                //     name: item.display_name || 'unknown product',
                //     brand: item.brand || 'unknown brand',
                //     variant: [{
                //         quantity: item.size || extractQuantity(item.display_name) || null,
                //         mrp: Number(item.finalMRP) || 0,
                //         price: Number(item.finalSalePrice) || 0,
                //         articleId: Number(item.objectID),
                //         variantUrl: `https://www.jiomart.com${item.url_path}`
                //     }],
                //     image: item.image_url || 'default-image.jpg',
                //     variantCodes: item?.variants?.map(v => {
                //         return v.product_code
                //     })
                // })
                // );

            }, { hits, firstResult })

            let index_name = await page.evaluate(() => window.algolia_suffix + "_master_vertical")
            let master_code = await page.evaluate(() => {
                let master_code = window.default_vertical_city_code;
                if (localStorage.getItem('jio_region_codes')) {
                    master_code = JSON.parse(localStorage.getItem('jio_region_codes'));
                }
                return master_code
            })
            for (let i = 0; i < transformed.length; i++) {
                const codes = []

                for (let j = 0; j < transformed[i]?.variantCodes?.length || 0; j++) {
                    //get variant data
                    codes.push({ indexName: index_name, objectID: String(transformed[i].variantCodes[j]) })
                }
                if ((transformed[i]?.variantCodes?.length || 0) > 0) {
                    const varResponse = await page.request.post(variantLink, {
                        headers,
                        data: JSON.stringify({ requests: codes }),
                    });
                    const variantData = await varResponse.json();
                    const variantHits = variantData?.results || [];
                    for (let k = 0; k < variantHits?.length || 0; k++) {
                        const hit = variantHits[k]
                        try {
                            let prod_vert = hit.category_level.level1[0].toUpperCase();
                            let region_code = master_code[prod_vert][0]
                            if (hit.buybox_mrp && hit.buybox_mrp && hit.buybox_mrp[region_code] && hit.buybox_mrp[region_code].available) {
                                const vari = {}
                                let reg_value = hit.buybox_mrp[region_code]
                                    , sellprice = parseFloat(reg_value.price).toFixed(2)
                                    , mrp = parseFloat(reg_value.mrp).toFixed(2)
                                // check if mrp or sellprice == 0 - do not push
                                if (sellprice !== '0.00' && mrp !== '0.00') {
                                    // push your item here

                                    vari.quantity = hit.size || extractQuantity(hit.display_name) || null,
                                        vari.mrp = Number(mrp) || 0,
                                        vari.price = Number(sellprice) || 0,
                                        vari.articleId = Number(hit.objectID),
                                        vari.variantUrl = `https://www.jiomart.com${hit.url_path}`
                                    transformed[i].variant.push(vari)

                                }
                            }
                        } catch (error) {
                            console.error(`error happened during getting variant ${error}`)
                        }
                    }
                }
            }
        } catch (err) {
            console.error(`❌ failed to parse json on page ${pageNum}:`, err);
            throw err;
        }

        const hits = body.results?.[0]?.hits || [];
        console.log(`⬅️  received ${hits.length} hits on page ${pageNum}`);

        if (hits.length === 0) {
            console.log(`🏁 No more hits at page ${pageNum}. Total products collected: ${allHits.length}`);
            break;
        }

        if (transformed.length == 0) {
            console.log(`length of total hits ${allHits.length} -- end `)
        } else {
            console.log(`curren len of hits ${allHits.length}`)
        }
        allHits.push(...transformed);
        job.attrs.data.total_products = allHits.length;
        job.attrs.data.progress = Math.round((allHits.length / 1000)) * 100;
        await job.save();
        pageNum++;
    }

    console.log(`✅ Finished scraping. Total hits: ${allHits.length}`);
    return allHits.map((item) => {
        delete item['variantCodes'];
        return item;
    });

}


