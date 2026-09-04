import { Request, Response } from 'express';
import axios from 'axios';

export default async function pinvidHandler(req: Request, res: Response) {
    const query = String(req.query.q || req.query.query || '').trim();

    if (!query) {
        return res.status(400).json({
            status: false,
            message: "Parameter 'q' diperlukan."
        });
    }

    const sourceUrl = `/search/videos/?q=${encodeURIComponent(query)}&rs=content_type_filter&filter_location=1`;
    const dataPayload = JSON.stringify({
        options: {
            query,
            scope: 'videos',
            rs: 'content_type_filter',
            redux_normalize_feed: true,
            source_url: sourceUrl
        },
        context: {}
    });

    const url = `https://id.pinterest.com/resource/BaseSearchResource/get/?source_url=${encodeURIComponent(sourceUrl)}&data=${encodeURIComponent(dataPayload)}`;

    const response = await axios.get(url, {
        headers: {
            accept: 'application/json, text/javascript, */*; q=0.01',
            'x-pinterest-appstate': 'active',
            'x-pinterest-pws-handler': 'www/search/[scope].js',
            'x-requested-with': 'XMLHttpRequest',
            'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
            referer: 'https://id.pinterest.com/',
            'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        timeout: 20000
    });

    const results = response.data.resource_response?.data?.results || [];

    const formatted = results
        .filter((pin: any) => pin.videos?.video_list)
        .map((pin: any) => {
            const vList = pin.videos.video_list;
            const videoUrl = vList.V_HLSV4?.url || vList.V_HLSV3_MOBILE?.url || null;

            return {
                id: pin.id,
                title: pin.grid_title || pin.title || 'No Title',
                video: videoUrl,
                thumbnail: pin.images?.orig?.url || null,
                duration: pin.videos?.duration || null,
                source: `https://www.pinterest.com/pin/${pin.id}/`,
                username: pin.pinner?.username || '-'
            };
        })
        .filter((item: any) => item.video !== null);

    return res.json({
        status: true,
        result: formatted
    });
}
