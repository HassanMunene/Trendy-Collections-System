<?php

namespace Database\Seeders;

use App\Enums\Role;
use App\Models\Colour;
use App\Models\ProductCategory;
use App\Models\StockItem;
use App\Models\User;
use App\Services\Audit;
use App\Services\StockItemReceiver;
use App\Support\ProductName;
use Illuminate\Database\Seeder;
use RuntimeException;

/**
 * Dummy products for trying the app, based on the shop's sales book (April–May 2026):
 * the kinds, colours and prices that actually appear there. Prices are in KES.
 *
 *   php artisan db:seed --class=DemoProductsSeeder
 *
 * Not part of DatabaseSeeder and refuses to run in production. Safe to run again:
 * a product that already exists (same kind, colour and type) is left alone.
 */
class DemoProductsSeeder extends Seeder
{
    /**
     * Kind => list of [colour or null, type/size, asking price KES, on the shelf, warn at].
     *
     * @var array<string, list<array{0: ?string, 1: string, 2: int, 3: int, 4: ?int}>>
     */
    private const PRODUCTS = [
        'Window curtain' => [
            ['Grey', '', 2600, 8, 2],
            ['Grey', 'Dark', 3500, 3, 2],
            ['Beige', '', 2200, 6, 2],
            ['Cream', '', 2200, 5, 2],
            ['Off-white', '', 3800, 4, 2],
            ['Black', '', 2200, 5, 2],
            ['Navy', '', 2500, 3, 2],
            ['Navy', 'Blackout', 3500, 2, 2],
            ['Royal blue', '', 2600, 4, 2],
            ['Sky blue', '', 2200, 2, 2],
            ['Maroon', '', 2000, 3, 2],
            ['Brown', '', 2600, 2, 2],
            ['Pink', '', 2200, 1, 2],
            ['Peach', '', 2500, 2, 2],
            ['Yellow', '', 2400, 0, 2],
            ['Orange', '', 2400, 2, 2],
            ['Turquoise', 'Leaf', 3500, 2, 1],
            ['Grey', 'Mizimizi', 3800, 3, 1],
        ],
        'Door curtain' => [
            ['Grey', '', 1200, 4, 1],
            ['Beige', '', 1200, 3, 1],
            ['Cream', '', 1000, 3, 1],
            ['Royal blue', '', 1000, 2, 1],
            ['Emerald green', '', 1500, 2, 1],
            ['Chocolate brown', 'Blackout', 1500, 1, 1],
        ],
        'Sheer' => [
            ['White', 'With rings', 800, 20, 5],
            ['White', 'Without rings', 700, 15, 5],
            ['Cream', 'With rings', 800, 6, 3],
            ['Grey', 'With rings', 800, 4, 3],
        ],
        'Kitchen curtain' => [
            ['Orange', '', 1500, 2, 1],
            ['Grey', '', 2500, 3, 1],
            ['Beige', '', 1500, 2, 1],
            ['Off-white', '', 2500, 1, 1],
            ['Brown', '', 1500, 0, 1],
        ],
        'Pillow case' => [
            ['White', '', 250, 40, 10],
            ['White', 'Big size', 350, 15, 5],
            ['Turquoise', 'Plain', 220, 12, 5],
            ['Grey', '', 250, 10, 5],
            [null, 'Striped B/H', 220, 4, 5],
        ],
        'Pillow' => [
            [null, '', 200, 30, 10],
            [null, 'Bed pillow', 400, 8, 4],
        ],
        'Knot pillow' => [
            ['Green', '', 450, 6, 2],
            ['Grey', '', 500, 4, 2],
            ['Cream', '', 450, 2, 2],
        ],
        'Bowtie pillow' => [
            ['Grey', '', 500, 5, 2],
            ['Pink', '', 450, 3, 2],
        ],
        'Curtain rod' => [
            [null, '2 m', 1000, 8, 3],
            [null, '3 m', 1300, 6, 3],
            ['Gold', '3 m', 1300, 4, 2],
            [null, 'Double', 1000, 3, 2],
        ],
        'Curtain holder' => [
            ['Grey', '', 450, 10, 3],
            ['Gold', '', 450, 6, 3],
            ['Cream', '', 400, 2, 3],
        ],
        'Alteration' => [
            [null, 'Adjustment', 250, 0, null],
        ],
    ];

    public function run(StockItemReceiver $receiver): void
    {
        if (app()->isProduction()) {
            throw new RuntimeException('Demo products are for trying the app, not for the live shop.');
        }

        $owner = User::where('role', Role::Owner->value)->where('active', true)->orderBy('id')->first()
            ?? throw new RuntimeException('Create an owner first: php artisan trendy:create-owner');

        $added = 0;
        foreach (self::PRODUCTS as $categoryName => $rows) {
            $category = ProductCategory::where('name', $categoryName)->firstOrFail();

            foreach ($rows as [$colourName, $variant, $priceKes, $quantity, $warnAt]) {
                $colour = $colourName ? Colour::firstOrCreate(['name' => $colourName]) : null;

                $exists = StockItem::products()
                    ->where('product_category_id', $category->id)
                    ->where('colour_id', $colour?->id)
                    ->whereRaw('lower(variant) = lower(?)', [$variant])
                    ->exists();
                if ($exists) {
                    continue;
                }

                $fields = [
                    'product_category_id' => $category->id,
                    'colour_id' => $colour?->id,
                    'variant' => $variant,
                    'name' => ProductName::make($category->name, $colour?->name, $variant),
                    'unit' => $category->unit,
                    'tracks_stock' => $category->tracks_stock,
                    'price_cents' => $priceKes * 100,
                    // A rough cost (about 55% of the asking price) so margin reports have something to show.
                    'cost_cents' => (int) round($priceKes * 55),
                    'reorder_level' => $category->tracks_stock ? $warnAt : null,
                    'notes' => 'Demo product',
                    'received_by' => $owner->id,
                ];

                if ($category->tracks_stock && $quantity > 0) {
                    $receiver->receive($owner, $fields, $quantity);
                } else {
                    $item = StockItem::create($fields);
                    Audit::record($owner, 'product.created', $item, ['name' => $item->name, 'via' => 'demo_seeder']);
                }
                $added++;
            }
        }

        $this->command?->info("Added {$added} demo products.");
    }
}
