// Checkout configuration

define(function (require) {
    return {
        // For testing on sandbox
        apiHost: 'https://api-sandbox.trycelery.com',
        //apiHost: 'https://api.trycelery.com',
        //slug: '5577bb6509b0fd0a0036e4d3',
        features: {
            quantity: false,
            shipping: false,
            taxes: false,
            coupons: true,
            facebookTrackingId: '914487875264661',
            googleAnalyticksTrackingId: 'UA-47871575-3'
        }
    };
});
