<?php

namespace Database\Seeders;

use App\Models\Colour;
use App\Models\FabricCategory;
use App\Models\MaterialType;
use App\Models\Texture;
use Illuminate\Database\Seeder;

/**
 * Starting lists the shop can edit. Safe to run more than once.
 * Replace or extend these with the words staff actually use (docs/06-DISCOVERY-QUESTIONS.md, question 4).
 */
class CatalogueSeeder extends Seeder
{
    public function run(): void
    {
        $lists = [
            FabricCategory::class => ['Curtain', 'Sheer', 'Lining', 'Pillow-case', 'Other'],
            MaterialType::class => ['Linen', 'Velvet', 'Voile', 'Polyester', 'Cotton', 'Satin', 'Jacquard', 'Blackout'],
            Texture::class => ['Plain', 'Woven', 'Embossed', 'Printed', 'Embroidered', 'Crushed'],
            Colour::class => ['White', 'Cream', 'Ivory', 'Beige', 'Grey', 'Silver', 'Brown', 'Gold', 'Maroon', 'Red', 'Pink', 'Purple', 'Blue', 'Navy', 'Green', 'Black'],
        ];

        foreach ($lists as $model => $names) {
            foreach ($names as $name) {
                $model::firstOrCreate(['name' => $name]);
            }
        }
    }
}
