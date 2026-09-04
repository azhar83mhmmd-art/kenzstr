import { Request, Response } from 'express';
import axios from 'axios';
import crypto from 'crypto';

const QUERY_GQL = `
query SearchProductV5Query($params: String!) {
  searchProductV5(params: $params) {
    header { totalData responseCode isQuerySafe }
    data {
      totalDataText
      products {
        id: id_str_auto_
        name
        url
        mediaURL { image image300 }
        shop { name city }
        price { text number original discountPercentage }
        rating
        labelGroups { position title }
      }
    }
  }
}`;

function buildParams(keyword: string, page: number, rows: number, uniqueId: string) {
    return new URLSearchParams({
        device: 'desktop',
        enter_method: 'normal_search',
        l_name: 'sre',
        navsource: 'home',
        ob: '23',
        page: String(page),
        q: keyword,
        related: 'true',
        rows: String(rows),
        safe_search: 'false',
        scheme: 'https',
        show_adult: 'false',
        source: 'universe',
        st: 'product',
        start: String((page - 1) * rows),
        topads_bucket: 'true',
        unique_id: uniqueId,
        user_cityId: '176',
        variants: '',
        warehouses: ''
    }).toString();
}

export default async function tokopediaHandler(req: Request, res: Response) {
    const query = String(req.query.q || req.query.query || '').trim();
    const limit = Math.min(Number(req.query.limit) || 10, 20);

    if (!query) {
        return res.status(400).json({
            status: false,
            message: "Parameter 'q' diperlukan."
        });
    }

    const deviceId = String(Math.floor(7000000000000000000 + Math.random() * 999999999999999999));
    const uniqueId = crypto.randomBytes(16).toString('hex');

    const { data } = await axios.post(
        'https://gql.tokopedia.com/graphql/SearchProductV5Query',
        [
            {
                operationName: 'SearchProductV5Query',
                variables: { params: buildParams(query, 1, 40, uniqueId) },
                query: QUERY_GQL
            }
        ],
        {
            headers: {
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
                'content-type': 'application/json',
                origin: 'https://www.tokopedia.com',
                referer: 'https://www.tokopedia.com/',
                'x-tkpd-lite-service': 'zeus',
                'bd-device-id': deviceId,
                'bd-web-id': deviceId
            },
            timeout: 20000
        }
    );

    const root = Array.isArray(data) ? data[0] : data;
    const search = root?.data?.searchProductV5;
    const products = (search?.data?.products || []).slice(0, limit);

    const result = products.map((x: any) => ({
        id: x?.id || null,
        name: x?.name || null,
        url: x?.url || null,
        image: x?.mediaURL?.image300 || x?.mediaURL?.image || null,
        price: x?.price?.text || null,
        original_price: x?.price?.original || null,
        discount: x?.price?.discountPercentage || 0,
        rating: x?.rating || null,
        sold: x?.labelGroups?.find((v: any) => v.position === 'ri_product_credibility')?.title || null,
        shop: x?.shop?.name || null,
        city: x?.shop?.city || null
    }));

    return res.json({
        status: true,
        total: Number(search?.header?.totalData || result.length),
        result
    });
}
