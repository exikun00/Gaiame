import { describe, it, expect } from 'vitest';
import historyController from '../controllers/historyController.js';

describe('Watch History Controller', () => {
  it('debe registrar y recuperar el progreso de visualización', async () => {
    const slug = 'test-history-anime';
    const ep_num = 1;

    // Simular req/res para updateProgress
    const req_mock: any = {
      body: {
        animeSlug: slug,
        animeTitle: 'Test History Anime',
        posterUrl: 'https://example.com/poster.jpg',
        episodeNum: ep_num,
        progressSec: 450,
        durationSec: 1440,
      },
    };

    let response_data: any = null;
    const res_mock: any = {
      json: (data: any) => {
        response_data = data;
      },
      status: () => res_mock,
    };

    await historyController.updateProgress(req_mock, res_mock);
    expect(response_data?.success).toBe(true);
    expect(response_data?.record?.progressSec).toBe(450);

    // Recuperar
    const get_req: any = { query: { q: slug } };
    let list_data: any = null;
    const get_res: any = {
      json: (data: any) => {
        list_data = data;
      },
      status: () => get_res,
    };

    await historyController.getHistory(get_req, get_res);
    expect(list_data?.history.length).toBeGreaterThanOrEqual(1);
    expect(list_data?.history[0].animeSlug).toBe(slug);

    // Limpiar elemento
    const del_req: any = { params: { id: response_data.record.id } };
    let del_data: any = null;
    const del_res: any = {
      json: (data: any) => {
        del_data = data;
      },
      status: () => del_res,
    };
    await historyController.deleteItem(del_req, del_res);
    expect(del_data?.success).toBe(true);
  });
});
