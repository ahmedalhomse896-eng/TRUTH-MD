const https = require('https');

function testAPI() {
    console.log('Testing AI API: https://apis.prexzyvilla.site/ai/copilot?text=Hi+dear');
    console.log('=' .repeat(60));

    const url = 'https://apis.prexzyvilla.site/ai/copilot?text=Hi+dear';

    https.get(url, (res) => {
        console.log('Status Code:', res.statusCode);
        console.log('Headers:', JSON.stringify(res.headers, null, 2));

        let data = '';
        res.on('data', (chunk) => {
            data += chunk;
        });

        res.on('end', () => {
            try {
                const jsonData = JSON.parse(data);
                console.log('Response Data:');
                console.log(JSON.stringify(jsonData, null, 2));
            } catch (e) {
                console.log('Raw Response:');
                console.log(data.substring(0, 500) + (data.length > 500 ? '...' : ''));
            }
        });
    }).on('error', (err) => {
        console.error('Error:', err.message);
    });
}

testAPI();