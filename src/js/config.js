// Checkout configuration

define(function (require) {
    return {
        // For testing on sandbox
        //apiHost: 'https://api-sandbox.trycelery.com',
        //apiHost: 'https://api.trycelery.com',
        //slug: '5577bb6509b0fd0a0036e4d3',
        host: 'http://bit.ly/AFROSTREAMTV',
        features: {
            quantity: false,
            minimumQuantity: 1,
            shipping: false,
            taxes: false,
            coupons: true,
            //facebookTrackingId: '914487875264661',
            facebook: {
                trackingId: null,
                form: "./payment.html",
                confirmation: "./confirmation.html"
            },
            google: {
                trackingId: 'UA-47871575-3',
                form: null,
                confirmation: null
            }
        }
    };
});
