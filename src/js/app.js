define(function (require) {
    'use strict';

    var $ = require('jquery');
    var celeryClient = require('celery_client');
    var shop = require('shop');
    var coupon = require('coupon');
    var config = require('config');
    var debounce = require('util').debounce;
    var locale = require('../locale/fr');
    var templates = require('templates/index');
    var overlayTemplate = templates.overlay;
    var modalTemplate = templates.modal;
    var formatMoney = require('format').formatMoney;
    var form = require('form').initialize();
    var confirmation = require('confirmation').initialize();

    return {
        initialize: function (options) {
            if (this.initialized) {
                return this;
            }

            if (options && options.slug) {
                celeryClient.config.slug = options.slug;
            }

            var $overlay = this.$overlay = $(overlayTemplate(locale.overlay));
            var $modal = this.$el = $(modalTemplate(locale.modal));
            var $form = this.$form = form.$el;
            var $confirmation = this.$confirmation = confirmation.$el;

            this.children = [$overlay, $modal];

            // Tax cache
            this._taxes = {};

            // Binding
            $.each([
                'show',
                'hide',
                'updateOrderSummary',
                'updateDiscount',
                'createOrder',
                'handleOrder',
                'handleError',
                'showShop',
                'showConfirmation'
            ], $.proxy(function (i, methodName) {
                this[methodName] = $.proxy(this[methodName], this);
            }, this));

            this.$modalBody = $modal.find('.Celery-Modal-body');

            // Currently does not take slug from data-celery
            $(document.body).on('click', '[data-celery]', this.show);
            this.$el.on('click', '.Celery-ModalCloseButton', this.hide);

            $form.on('valid', this.createOrder);
            $form.on('change', 'select, [name=shipping_zip]',
                this.updateOrderSummary);
            $form.on('keyup', '[name=coupon]', debounce(this.updateDiscount, 500));

            $form.find('select').change();

            this.showShop();

            this.initialized = true;

            return this;
        },

        loadShop: function () {
            // TODO: Support passing slug
            var el = $('[data-celery]').first();
            var slug = el && $(el).data('celery') || '';

            if (slug) {
                celeryClient.config.slug = slug;
            }

            shop.fetch(this.updateOrderSummary);
        },

        show: function () {
            var self = this;

            // Load shop data if it wasn't loaded yet
            if (!shop.data.user_id) {
                this.loadShop();
            }
            $(document.body).css('overflow', 'hidden');
            $(document.body).append(this.children);
            this.showShop();
            // Sets display
            this.$overlay.removeClass('u-hidden');
            this.$el.removeClass('u-hidden');

            // next tick
            setTimeout(function () {
                // is-hidden uses opacity/transform so the transition occurs
                self.$overlay.removeClass('is-hidden');
                self.$el.removeClass('is-hidden');
            }, 0);
            return this;
        },

        hide: function () {
            var self = this;

            this.clear();
            $(document.body).css('overflow', 'auto');
            // is-hidden uses opacity/transform so the transition occurs
            this.$overlay.addClass('is-hidden');
            this.$el.addClass('is-hidden');

            setTimeout(function () {
                // Sets display after 300ms
                self.$overlay.addClass('u-hidden');
                self.$el.addClass('u-hidden');
                self.showShop();
            }, 300);

            return this;
        },

        clear: function () {
            this.$form.find('input').val('');
            this.$form.find('.is-invalid, .is-valid').removeClass('is-invalid is-valid');
        },

        updateOrderSummary: function () {
            var shopData = shop.data;

            if (!shopData) return;

            var quantity = this._getQuantity();
            var price = formatMoney(this._getPrice());
            var shipping = formatMoney(this._getShipping());

            var $form = this.$form;

            if (config.features.taxes && celeryClient.config.userId) {
                this.updateTaxes();
            }

            if (config.features.coupons && celeryClient.config.userId) {
                this.updateDiscount();
            }

            this.updateTotal();

            $form.find('.Celery-OrderSummary-price--price').text(price);
            $form.find('.Celery-OrderSummary-price--shipping').text(shipping);
            $form.find('.Celery-OrderSummary-number--quantity').text(quantity);
        },

        createOrder: function () {
            var order = this._generateOrder();

            celeryClient.createOrder(order, this.handleOrder);
        },

        handleOrder: function (err, res) {
            if (err) {
                return this.handleError(err);
            }

            this.showConfirmation(res.data);
            this.onConfirmation(res.data);
        },

        onConfirmation: function (data) {
            //PUSH TRACKING FB
            if (config.features.facebook.trackingId !== false) {
                var _fbq = window._fbq || (window._fbq = []);
                if (!_fbq.loaded) {
                    var fbds = document.createElement('script');
                    fbds.async = true;
                    fbds.src = '//connect.facebook.net/en_US/fbds.js';
                    var s = document.getElementsByTagName('script')[0];
                    s.parentNode.insertBefore(fbds, s);
                    _fbq.loaded = true;
                }
                window._fbq = window._fbq || [];
                window._fbq.push(['track', config.features.facebook.trackingId, {
                    'value': this._getTotal(),
                    'currency': data.currency
                }]);
            }
            //PUSH TRACKING GOOGLE
            var totl = Math.max(0, this._getTotal() / 100);
            if (config.features.google.trackingId) {
                var _gaq = window._gaq || (window._gaq = []);
                _gaq.push(['_setAccount', config.features.google.trackingId]);
                _gaq.push(['_trackPageview']);
                _gaq.push(['_addTrans',
                    data._id,           // transaction ID - required
                    data.seller._id,  // affiliation or store name
                    totl,          // total - required
                    data.taxes,           // tax
                    data.shipping,              // shipping
                    data.shipping_address.city,       // city
                    data.shipping_address.state,     // state or province
                    data.shipping_address.country             // country
                ]);

                // add item might be called for every item in the shopping cart
                // where your ecommerce engine loops through each item in the cart and
                // prints out _addItem for each

                var product = data.line_items[0];
                _gaq.push(['_addItem',
                    product['product_id'] + '-FR-EUR',           // transaction ID - required
                    product['celery_sku'],           // SKU/code - required
                    product['product_name'],        // product name
                    product['variant_name'],   // category or variation
                    totl,//product['price'],          // unit price - required
                    product['quantity']              // quantity - required
                ]);
                _gaq.push(['_trackTrans']); //submits transaction to the Analytics servers

                (function () {
                    var ga = document.createElement('script');
                    ga.type = 'text/javascript';
                    ga.async = true;
                    ga.src = ('https:' == document.location.protocol ? 'https://ssl' : 'http://www') + '.google-analytics.com/ga.js';
                    var s = document.getElementsByTagName('script')[0];
                    s.parentNode.insertBefore(ga, s);
                })();

            }
        },

        handleError: function (err) {
            var $errors = this.$form.find('.Celery-FormSection--errors');

            $errors.find('.Celery-FormSection-body').text(err.message);
            $errors.removeClass('u-hidden');
            form.enableBuyButton();
        },

        hideErrors: function () {
            var $errors = this.$form.find('.Celery-FormSection--errors');
            $errors.addClass('u-hidden');
        },

        hideHeader: function () {
            this.$el.find('.Celery-Modal-header').addClass('is-hidden');
        },

        showHeader: function () {
            this.$el.find('.Celery-Modal-header').removeClass('is-hidden');
        },

        showShop: function () {
            this.showHeader();
            this.hideErrors();
            confirmation.$el.detach();
            this.$modalBody.append(this.$form);
        },

        showConfirmation: function (data) {
            confirmation.render(data);
            this.hideHeader();
            this.$form.detach();
            this.$modalBody.append(confirmation.$el);
        },

        updateTaxes: function () {
            var countryCode = this._getCountry();
            var zip = this._getZip();

            // Cache hit
            if (this._taxes[countryCode + zip] !== undefined) {
                var taxRate = this._taxes[countryCode + zip];
                var tax = taxRate * this._getSubtotal();

                tax = formatMoney(tax);
                this.$form.find('.Celery-OrderSummary-price--taxes').text(tax);
                this.updateTotal();

                return;
            }

            celeryClient.fetchTaxes({
                shipping_country: countryCode,
                shipping_zip: zip
            }, $.proxy(function (err, data) {
                if (err || !data || !data.data || data.data.base === undefined) {
                    return;
                }

                this._taxes[countryCode + zip] = data.data.base;

                this.updateTaxes();
            }, this));
        },

        // Coupon adds a discount
        updateDiscount: function () {
            var code = this._getCouponCode();
            var priceSelector = '.Celery-OrderSummary-price--coupon';
            var operatorSelector = '.Celery-OrderSummary-operator.coupon';
            var lineSelector = '.Celery-OrderSummary-line.coupon';
            var groupSelector = lineSelector + ', ' + operatorSelector;

            coupon.validate(code, $.proxy(function (valid) {
                var discount;

                this.updateTotal();

                // TODO: Move coupon live validation to form
                form._setCouponValidationClass(valid);

                if (!valid || code === '') {
                    $(groupSelector).hide();
                    return;
                }

                // TODO: Discount logic instead of assuming single flat amount
                discount = formatMoney(this._getDiscount());

                $(priceSelector).text(discount);
                $(groupSelector).show();
            }, this));
        },

        updateTotal: function () {
            var total = formatMoney(this._getTotal());

            this.$form.find('.Celery-OrderSummary-price--total').text(total);
        },

        _generateOrder: function () {
            var $form = this.$form;
            var order = {
                buyer: {},
                shipping_address: {},
                line_items: [],
                payment_source: {
                    card: {
                        number: '',
                        exp_month: '',
                        exp_year: '',
                        cvc: ''
                    }
                }
            };

            order.user_id = shop.data.user_id;
            order.buyer.email = this._getFieldValue('email');
            order.buyer.first_name = this._getFieldValue('first-name');
            order.buyer.last_name = this._getFieldValue('last-name');

            // Card
            var card = order.payment_source.card;

            card.number = this._getFieldValue('card_number');
            card.cvc = this._getFieldValue('cvc');

            // Card Expiry
            var expiry = this._getFieldValue('expiry');
            var expiryParts = expiry.split('/');

            card.exp_month = expiryParts[0].trim();
            card.exp_year = expiryParts[1].trim();

            // Shipping
            order.shipping_address.country = this._getCountry();

            if (config.features.taxes) {
                order.shipping_address.zip = this._getZip();
            }

            // Coupon
            if (config.features.coupons) {
                var couponCode = this._getCouponCode();

                if (couponCode) {
                    order.discount_codes = [couponCode];
                }
            }

            // Line Item
            var lineItem = {
                product_id: shop.data.product._id,
                quantity: this._getQuantity()
            };

            order.line_items.push(lineItem);

            return order;
        },

        _getDiscount: function () {
            // TODO: Replace with coupon logic
            var code = this._getCouponCode();
            var data = coupon.data[code];

            return data && data.amount || 0;
        },

        _getCouponCode: function () {
            var code = this._getFieldValue('coupon') || '';

            return code.toLowerCase();
        },

        _getQuantity: function () {
            return Math.max(this._getFieldValue('quantity') || config.features.minimumQuantity, config.features.minimumQuantity);
        },

        _getCountry: function () {
            return this._getFieldValue('country');
        },

        _getZip: function () {
            return this._getFieldValue('shipping_zip');
        },

        _getFieldValue: function (fieldName) {
            var $field = this.$form.find('[name=' + fieldName + ']');

            if (!$field.length) {
                return;
            }

            return $field.val();
        },

        _getPrice: function () {
            return shop.data.product && shop.data.product.price;
        },

        _getSubtotal: function () {
            return this._getPrice() * this._getQuantity();
        },

        _getShipping: function () {
            var quantity = this._getQuantity();
            var rates = this._getShippingRates();

            if (!rates) {
                return 0;
            }

            var base = rates.base || 0;
            var item = rates.item || 0;

            if (!base && !item) {
                return 0;
            }

            return base + ((quantity - 1) * item);
        },

        // Gets shipping rates based on country, falls back to base
        _getShippingRates: function () {
            var rates = shop.data.shipping_rates;
            var result = rates;

            if (!rates || !rates.countries || !rates.countries.length) {
                return result;
            }

            var countryCode = this._getCountry();

            $.each(rates.countries, function (i, country) {
                if (country.code === countryCode) {
                    result = country;
                    return;
                }
            });

            return result;
        },

        _getTaxes: function () {
            var countryCode = this._getCountry();
            var zip = this._getZip();

            if (this._taxes[countryCode + zip] !== undefined) {
                var taxRate = this._taxes[countryCode + zip];
                var taxes = taxRate * this._getSubtotal();

                return taxes;
            }

            return 0;
        },

        _getTotal: function () {
            var quantity = this._getQuantity();
            var price = this._getPrice();
            var shipping = this._getShipping();
            var discount = this._getDiscount();
            var taxes = this._getTaxes();

            return (quantity * price) + shipping + taxes - discount;
        }
    };
});
