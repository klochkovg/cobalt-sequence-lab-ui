import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { JsonPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  imports: [FormsModule, JsonPipe],
  selector: 'app-nucleotides-form',
  styleUrl: './nucleotides-form.scss',
  templateUrl: './nucleotides-form.html',
})
export class NucleotidesForm {
  private readonly http = inject(HttpClient);

  protected sequence = '';
  protected readonly result = signal<unknown>(null);
  protected readonly error = signal<string | null>(null);

  protected submit(): void {
    this.error.set(null);
    this.http.put<unknown>('/stats', { sequence: this.sequence }).subscribe({
      next: (response) => this.result.set(response),
      error: (err) => this.error.set(err.message),
    });
  }
}
