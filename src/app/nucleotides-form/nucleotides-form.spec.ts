import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NucleotidesForm } from './nucleotides-form';

describe('NucleotidesForm', () => {
  let component: NucleotidesForm;
  let fixture: ComponentFixture<NucleotidesForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NucleotidesForm],
    }).compileComponents();

    fixture = TestBed.createComponent(NucleotidesForm);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
